import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, AppError } from '../middleware/error-handler';
import { get } from '../common/dynamodb-client';
import { s3 } from '../common/s3-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';

/**
 * 画像ダウンロードハンドラー
 * 
 * GET /api/admin/images/:id/download
 * 
 * 機能:
 * - 画像の署名付きURLを生成
 * - 権限チェック
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('画像ダウンロード処理開始', {
    requestId: context.awsRequestId,
  });

  // パスパラメータの取得
  const imageId = event.pathParameters?.id;
  if (!imageId) {
    throw new AppError('画像IDが指定されていません', 400);
  }

  // ユーザー情報の取得（TODO: タスク3.9で認証実装後に修正）
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const userRole = event.requestContext.authorizer?.claims?.['cognito:groups']?.[0] || 'Regular_User';

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    imageId,
  });

  try {
    // 画像メタデータの取得
    const imageMetadata = await get({
      tableName: IMAGES_TABLE,
      key: {
        PK: `IMAGE#${imageId}`,
        SK: 'METADATA',
      },
    });

    if (!imageMetadata) {
      throw new AppError('画像が見つかりません', 404);
    }

    // 権限チェック
    // System_Admin、Image_Manager: すべての画像をダウンロード可能
    // Regular_User: 自分の画像のみダウンロード可能
    if (userRole === 'Regular_User' && imageMetadata.ownerId !== currentUserId) {
      throw new AppError('この画像をダウンロードする権限がありません', 403);
    }

    // 署名付きURLを生成（有効期限: 1時間）
    const downloadUrl = await s3.getSignedDownloadUrl({
      Bucket: IMAGES_BUCKET,
      Key: imageMetadata.s3Key,
      ExpiresIn: 3600, // 1時間
    });

    logger.info('画像ダウンロードURL生成完了', {
      imageId,
      fileName: imageMetadata.fileName,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        downloadUrl,
        fileName: imageMetadata.fileName,
        fileSize: imageMetadata.fileSize,
        mimeType: imageMetadata.mimeType,
        expiresIn: 3600,
      }),
    };
  } catch (error) {
    logger.error('画像ダウンロードエラー', { error, imageId });
    throw error;
  }
});
