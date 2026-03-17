import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const REGION = process.env.AWS_REGION || 'us-west-2';

// S3クライアント
const s3Client = new S3Client({ region: REGION });

// 署名付きURLの有効期限（秒）
const URL_EXPIRATION = 300; // 5分

/**
 * 画像アップロード用署名付きURL発行ハンドラー
 * 
 * POST /api/admin/images/upload-url
 * 
 * リクエストボディ:
 * {
 *   filename: string;      // ファイル名
 *   contentType: string;   // MIMEタイプ（image/jpeg）
 * }
 * 
 * レスポンス:
 * {
 *   uploadUrl: string;     // S3署名付きURL
 *   imageId: string;       // 画像ID
 *   s3Key: string;         // S3キー
 * }
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('署名付きURL発行処理開始', {
    requestId: context.awsRequestId,
  });

  // リクエストボディの検証
  if (!event.body) {
    throw new AppError('リクエストボディが必要です', 400);
  }

  const body = JSON.parse(event.body);
  const { filename, contentType } = body;

  if (!filename) {
    throw new AppError('ファイル名が必要です', 400);
  }

  if (!contentType) {
    throw new AppError('Content-Typeが必要です', 400);
  }

  // JPEG形式のみ許可
  if (!['image/jpeg', 'image/jpg'].includes(contentType)) {
    throw new AppError('JPEG形式のみアップロード可能です', 400);
  }

  // ユーザー情報の取得
  const userId = event.requestContext.authorizer?.claims?.sub || 'test-user';

  // 画像IDの生成
  const imageId = uuidv4();
  const timestamp = new Date().toISOString();

  // S3キーの生成
  const s3Key = `images/${userId}/${imageId}/${filename}`;

  // 署名付きURLの生成
  const command = new PutObjectCommand({
    Bucket: IMAGES_BUCKET,
    Key: s3Key,
    ContentType: contentType,
    Metadata: {
      'original-filename': filename,
      'uploaded-by': userId,
      'uploaded-at': timestamp,
      'image-id': imageId,
    },
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: URL_EXPIRATION,
  });

  logger.info('署名付きURL発行完了', {
    imageId,
    s3Key,
    expiresIn: URL_EXPIRATION,
  });

  return successResponse({
    uploadUrl,
    imageId,
    s3Key,
    userId,
    filename,
  });
});
