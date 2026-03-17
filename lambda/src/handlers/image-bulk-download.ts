import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get } from '../common/dynamodb-client';
import { s3, s3Client } from '../common/s3-client';
import { logger } from '../common/logger';
import AdmZip from 'adm-zip';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const MAX_BULK_DOWNLOAD = 200; // 一括ダウンロードの最大件数

/**
 * 一括画像ダウンロードハンドラー
 * 
 * POST /api/admin/images/download/bulk
 * 
 * メモリ内ZIP生成 → S3アップロード → 署名付きURL返却
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('一括画像ダウンロード処理開始', {
    requestId: context.awsRequestId,
  });

  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { imageIds } = body;

  if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
    throw new AppError('画像IDの配列が無効です', 400);
  }

  if (imageIds.length > MAX_BULK_DOWNLOAD) {
    throw new AppError(`一度にダウンロードできる画像は${MAX_BULK_DOWNLOAD}件までです`, 400);
  }

  // ユーザー情報の取得
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';

  // Cognitoグループの取得
  const cognitoGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
  let groups: string[] = [];
  
  if (typeof cognitoGroups === 'string') {
    try {
      if (cognitoGroups.startsWith('[')) {
        groups = JSON.parse(cognitoGroups);
      } else {
        groups = [cognitoGroups];
      }
    } catch (error) {
      logger.warn('Cognitoグループのパースに失敗', { cognitoGroups, error });
      groups = [cognitoGroups];
    }
  } else if (Array.isArray(cognitoGroups)) {
    groups = cognitoGroups;
  }

  let userRole = 'Regular_User';
  if (groups.includes('System_Admin')) {
    userRole = 'System_Admin';
  } else if (groups.includes('Image_Manager')) {
    userRole = 'Image_Manager';
  }

  logger.info('ユーザー情報', { currentUserId, userRole, imageCount: imageIds.length });

  // ZIPファイルのS3キー
  const zipKey = `tmp/downloads/${currentUserId}/${Date.now()}.zip`;

  // AdmZipでメモリ内ZIP生成
  const zip = new AdmZip();

  const downloadedImages: string[] = [];
  const failedImages: Array<{ imageId: string; reason: string }> = [];

  // 画像を1枚ずつ取得してZIPに追加
  for (const imageId of imageIds) {
    try {
      // Lambdaの残り時間チェック（60秒の余裕を持つ）
      const remainingTime = context.getRemainingTimeInMillis();
      if (remainingTime < 60000) {
        logger.warn('残り時間が少ないため処理を中断', { remainingTime, processedCount: downloadedImages.length });
        for (const remainingId of imageIds.slice(imageIds.indexOf(imageId))) {
          if (!downloadedImages.includes(remainingId) && !failedImages.some(f => f.imageId === remainingId)) {
            failedImages.push({ imageId: remainingId, reason: 'タイムアウトのためスキップ' });
          }
        }
        break;
      }

      const imageMetadata = await get({
        tableName: IMAGES_TABLE,
        key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
      });

      if (!imageMetadata) {
        failedImages.push({ imageId, reason: '画像が見つかりません' });
        continue;
      }

      if (userRole === 'Regular_User' && imageMetadata.ownerId !== currentUserId) {
        failedImages.push({ imageId, reason: 'ダウンロードする権限がありません' });
        continue;
      }

      // S3から画像データをBufferとして取得
      const command = new GetObjectCommand({
        Bucket: IMAGES_BUCKET,
        Key: imageMetadata.s3Key,
      });
      const s3Response = await s3Client.send(command);

      if (s3Response.Body) {
        const bodyBytes = await s3Response.Body.transformToByteArray();
        zip.addFile(imageMetadata.fileName, Buffer.from(bodyBytes));
        downloadedImages.push(imageId);
        logger.info('画像をZIPに追加', { imageId, fileName: imageMetadata.fileName, size: bodyBytes.length });
      } else {
        failedImages.push({ imageId, reason: 'S3からのデータ取得に失敗' });
      }
    } catch (error) {
      logger.error('画像ダウンロードエラー', { error, imageId });
      failedImages.push({
        imageId,
        reason: error instanceof Error ? error.message : '不明なエラー',
      });
    }
  }

  if (downloadedImages.length === 0) {
    throw new AppError('ダウンロード可能な画像がありませんでした', 400);
  }

  // ZIPバッファを生成
  const zipBuffer = zip.toBuffer();
  logger.info('ZIP生成完了', { zipSize: zipBuffer.length });

  // S3にアップロード
  await s3Client.send(new PutObjectCommand({
    Bucket: IMAGES_BUCKET,
    Key: zipKey,
    Body: zipBuffer,
    ContentType: 'application/zip',
  }));
  logger.info('S3アップロード完了', { zipKey });

  // 署名付きURLを生成（10分間有効、Content-Disposition付き）
  const zipFileName = `images-${Date.now()}.zip`;
  const command = new GetObjectCommand({
    Bucket: IMAGES_BUCKET,
    Key: zipKey,
    ResponseContentDisposition: `attachment; filename="${zipFileName}"`,
    ResponseContentType: 'application/zip',
  });
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 600,
  });

  logger.info('一括画像ダウンロード完了', {
    successCount: downloadedImages.length,
    failedCount: failedImages.length,
  });

  return successResponse({
    downloadUrl,
    downloadedImages,
    failedImages,
    summary: {
      total: imageIds.length,
      success: downloadedImages.length,
      failed: failedImages.length,
    },
  });
});
