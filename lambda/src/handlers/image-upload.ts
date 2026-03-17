import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { putObject } from '../common/s3-client';
import { put } from '../common/dynamodb-client';
import { logger } from '../common/logger';
import { validateImageFile } from '../common/validator';
import { extractExifMetadata, getImageSize } from '../common/exif-extractor';

// 環境変数
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * 画像アップロードハンドラー
 * 
 * POST /api/admin/images/upload
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('画像アップロード処理開始', {
    requestId: context.awsRequestId,
  });

  // リクエストボディの検証
  if (!event.body) {
    throw new AppError('画像ファイルが指定されていません', 400);
  }

  // JSONボディのパース
  const body = JSON.parse(event.body);
  const { files } = body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new AppError('アップロードする画像ファイルが見つかりません', 400);
  }

  try {
    // ユーザー情報の取得
    const userId = event.requestContext.authorizer?.claims?.sub || 'test-user';
    const userName = event.requestContext.authorizer?.claims?.name || 
                     event.requestContext.authorizer?.claims?.['cognito:username'] || 
                     event.requestContext.authorizer?.claims?.email || 
                     'Test User';

    // アップロード結果を格納する配列
    const uploadResults = [];

    // 各ファイルをアップロード
    for (const file of files) {
      try {
        // base64データからバイナリに変換
        const base64Data = file.content.split(',')[1]; // data:image/jpeg;base64, を除去
        const buffer = Buffer.from(base64Data, 'base64');

        // ファイル検証
        validateImageFile(file.filename, buffer.length, file.contentType);

        // ファイルサイズチェック
        if (buffer.length > MAX_FILE_SIZE) {
          uploadResults.push({
            filename: file.filename,
            success: false,
            error: `ファイルサイズが制限（${MAX_FILE_SIZE / 1024 / 1024}MB）を超えています`,
          });
          continue;
        }

        // 画像IDの生成
        const imageId = uuidv4();
        const timestamp = new Date().toISOString();

        // S3キーの生成
        const s3Key = `images/${userId}/${imageId}/${file.filename}`;

        // S3へのアップロード
        await putObject({
          bucket: IMAGES_BUCKET,
          key: s3Key,
          body: buffer,
          contentType: file.contentType,
          metadata: {
            originalFilename: file.filename,
            uploadedBy: userId,
            uploadedAt: timestamp,
          },
        });

        logger.info('S3アップロード完了', {
          imageId,
          s3Key,
          fileSize: buffer.length,
        });

        // EXIF情報の抽出
        const exifMetadata = extractExifMetadata(buffer);
        
        // 画像サイズの取得（EXIF情報がない場合はフォールバック）
        const imageSize = exifMetadata.width && exifMetadata.height
          ? { width: exifMetadata.width, height: exifMetadata.height }
          : getImageSize(buffer);
        
        // メタデータの統合
        const metadata = {
          width: imageSize.width || 0,
          height: imageSize.height || 0,
          capturedAt: exifMetadata.capturedAt || timestamp,
          cameraMake: exifMetadata.cameraMake,
          cameraModel: exifMetadata.cameraModel,
          orientation: exifMetadata.orientation,
          latitude: exifMetadata.latitude,
          longitude: exifMetadata.longitude,
          iso: exifMetadata.iso,
          fNumber: exifMetadata.fNumber,
          exposureTime: exifMetadata.exposureTime,
          focalLength: exifMetadata.focalLength,
        };
        
        logger.info('メタデータ抽出完了', {
          imageId,
          metadata,
        });

        // DynamoDBへのメタデータ保存
        const imageMetadata: Record<string, any> = {
          PK: `IMAGE#${imageId}`,
          SK: 'METADATA',
          imageId,
          fileName: file.filename,
          fileSize: buffer.length,
          mimeType: file.contentType,
          width: metadata.width,
          height: metadata.height,
          uploadedAt: timestamp,
          capturedAt: metadata.capturedAt,
          tags: [],
          isPublic: false,
          ownerId: userId,
          ownerName: userName,
          s3Key,
          thumbnailKeys: {
            small: '',
            medium: '',
            large: '',
          },
          GSI1PK: `USER#${userId}`,
          GSI1SK: `${timestamp}#${imageId}`,
          GSI2PK: 'PUBLIC#false',
          GSI2SK: `${metadata.capturedAt}#${imageId}`,
        };
        
        // フォルダパス情報が存在する場合は追加
        if (file.folderPath) {
          imageMetadata.folderPath = file.folderPath;
        }
        
        // EXIF情報が存在する場合は追加
        if (metadata.cameraMake) imageMetadata.cameraMake = metadata.cameraMake;
        if (metadata.cameraModel) imageMetadata.cameraModel = metadata.cameraModel;
        if (metadata.orientation) imageMetadata.orientation = metadata.orientation;
        if (metadata.latitude !== undefined) imageMetadata.latitude = metadata.latitude;
        if (metadata.longitude !== undefined) imageMetadata.longitude = metadata.longitude;
        if (metadata.iso) imageMetadata.iso = metadata.iso;
        if (metadata.fNumber) imageMetadata.fNumber = metadata.fNumber;
        if (metadata.exposureTime) imageMetadata.exposureTime = metadata.exposureTime;
        if (metadata.focalLength) imageMetadata.focalLength = metadata.focalLength;

        await put({
          tableName: IMAGES_TABLE,
          item: imageMetadata,
        });

        logger.info('DynamoDBメタデータ保存完了', {
          imageId,
          fileName: file.filename,
        });

        uploadResults.push({
          filename: file.filename,
          success: true,
          imageId,
          s3Key,
          metadata: imageMetadata,
        });
      } catch (error) {
        logger.error('ファイルアップロード失敗', {
          filename: file.filename,
          error,
        });

        uploadResults.push({
          filename: file.filename,
          success: false,
          error: error instanceof Error ? error.message : '不明なエラー',
        });
      }
    }

    // 結果の集計
    const successCount = uploadResults.filter(r => r.success).length;
    const failureCount = uploadResults.filter(r => !r.success).length;

    logger.info('画像アップロード処理完了', {
      total: uploadResults.length,
      success: successCount,
      failure: failureCount,
    });

    return successResponse({
      message: `${successCount}件のファイルをアップロードしました`,
      results: uploadResults,
      summary: {
        total: uploadResults.length,
        success: successCount,
        failure: failureCount,
      },
    });
  } catch (error) {
    logger.error('画像アップロード処理エラー', { error });
    throw error;
  }
});

/**
 * マルチパートフォームデータのパース
 */
function parseMultipartFormData(body: string, contentType: string): {
  files: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
    folderPath?: string;  // フォルダアップロード時の相対パス
  }>;
  fields: Record<string, string>;
} {
  // Content-Typeからboundaryを抽出
  const boundaryMatch = contentType.match(/boundary=([^;]+)/);
  if (!boundaryMatch) {
    throw new Error('boundaryが見つかりません');
  }

  const boundary = boundaryMatch[1];
  
  // Base64デコード（API Gatewayがbase64エンコードする場合）
  const bodyBuffer = Buffer.from(body, 'base64');
  const bodyString = bodyBuffer.toString('binary');
  
  const parts = bodyString.split(`--${boundary}`);

  const files: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
    folderPath?: string;
  }> = [];
  const fields: Record<string, string> = {};
  let currentFolderPath: string | undefined;

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--' || part.trim() === '') {
      continue;
    }

    // ヘッダーとボディを分離
    const headerEndIndex = part.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
      continue;
    }

    const headerSection = part.substring(0, headerEndIndex);
    const bodyContent = part.substring(headerEndIndex + 4);

    // Content-Dispositionヘッダーのパース
    const dispositionMatch = headerSection.match(/Content-Disposition: form-data; name="([^"]+)"(?:; filename="([^"]+)")?/);
    if (!dispositionMatch) {
      continue;
    }

    const fieldName = dispositionMatch[1];
    const filename = dispositionMatch[2];

    if (filename) {
      // ファイルの場合
      const contentTypeMatch = headerSection.match(/Content-Type: ([^\r\n]+)/);
      const fileContentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';

      // 末尾の\r\nを削除
      const cleanBody = bodyContent.replace(/\r\n$/, '');

      files.push({
        filename,
        contentType: fileContentType,
        content: Buffer.from(cleanBody, 'binary'),
        folderPath: currentFolderPath,  // フォルダパス情報を追加
      });
    } else {
      // 通常のフィールドの場合
      const fieldValue = bodyContent.replace(/\r\n$/, '');
      fields[fieldName] = fieldValue;
      
      // フォルダパス情報を保存（次のファイルで使用）
      if (fieldName === 'folderPath') {
        currentFolderPath = fieldValue;
      }
    }
  }

  return { files, fields };
}
