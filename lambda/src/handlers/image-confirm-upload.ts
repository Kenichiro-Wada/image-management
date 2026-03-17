import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { put } from '../common/dynamodb-client';
import { logger } from '../common/logger';
import { extractExifMetadata, getImageSize } from '../common/exif-extractor';

// 環境変数
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const REGION = process.env.AWS_REGION || 'us-west-2';

// S3クライアント
const s3Client = new S3Client({ region: REGION });

/**
 * 画像アップロード確認・メタデータ登録ハンドラー
 * 
 * POST /api/admin/images/confirm-upload
 * 
 * S3への直接アップロード完了後に呼び出し、
 * DynamoDBにメタデータを登録する
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('アップロード確認処理開始', {
    requestId: context.awsRequestId,
  });

  if (!event.body) {
    throw new AppError('リクエストボディが必要です', 400);
  }

  const body = JSON.parse(event.body);
  const { imageId, s3Key, filename } = body;

  if (!imageId || !s3Key || !filename) {
    throw new AppError('imageId, s3Key, filenameが必要です', 400);
  }

  // ユーザー情報の取得
  const userId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const userName = event.requestContext.authorizer?.claims?.name || 
                   event.requestContext.authorizer?.claims?.['cognito:username'] || 
                   event.requestContext.authorizer?.claims?.email || 
                   'Test User';

  // S3オブジェクトの取得とExif情報抽出
  let fileSize = 0;
  let fileBuffer: Buffer;
  try {
    const getResult = await s3Client.send(new GetObjectCommand({
      Bucket: IMAGES_BUCKET,
      Key: s3Key,
    }));
    // ストリームをBufferに変換
    const bodyBytes = await getResult.Body!.transformToByteArray();
    fileBuffer = Buffer.from(bodyBytes);
    fileSize = fileBuffer.length;
  } catch (error) {
    logger.error('S3オブジェクトが見つかりません', { s3Key, error });
    throw new AppError('アップロードされたファイルが見つかりません', 404);
  }

  // EXIF情報の抽出
  const exifMetadata = extractExifMetadata(fileBuffer);
  
  // 画像サイズの取得（EXIF情報がない場合はフォールバック）
  const imageSize = exifMetadata.width && exifMetadata.height
    ? { width: exifMetadata.width, height: exifMetadata.height }
    : getImageSize(fileBuffer);

  logger.info('EXIF情報抽出完了', {
    imageId,
    exifMetadata,
    imageSize,
  });

  const timestamp = new Date().toISOString();

  // DynamoDBへのメタデータ保存
  const capturedAt = exifMetadata.capturedAt || timestamp;
  const imageMetadata: Record<string, any> = {
    PK: `IMAGE#${imageId}`,
    SK: 'METADATA',
    imageId,
    fileName: filename,
    fileSize,
    mimeType: 'image/jpeg',
    width: imageSize.width || 0,
    height: imageSize.height || 0,
    uploadedAt: timestamp,
    capturedAt,
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
    GSI2SK: `${capturedAt}#${imageId}`,
  };

  // EXIF情報が存在する場合は追加
  if (exifMetadata.cameraMake) imageMetadata.cameraMake = exifMetadata.cameraMake;
  if (exifMetadata.cameraModel) imageMetadata.cameraModel = exifMetadata.cameraModel;
  if (exifMetadata.orientation) imageMetadata.orientation = exifMetadata.orientation;
  if (exifMetadata.latitude !== undefined) imageMetadata.latitude = exifMetadata.latitude;
  if (exifMetadata.longitude !== undefined) imageMetadata.longitude = exifMetadata.longitude;
  if (exifMetadata.iso) imageMetadata.iso = exifMetadata.iso;
  if (exifMetadata.fNumber) imageMetadata.fNumber = exifMetadata.fNumber;
  if (exifMetadata.exposureTime) imageMetadata.exposureTime = exifMetadata.exposureTime;
  if (exifMetadata.focalLength) imageMetadata.focalLength = exifMetadata.focalLength;

  await put({
    tableName: IMAGES_TABLE,
    item: imageMetadata,
  });

  logger.info('メタデータ登録完了', {
    imageId,
    fileName: filename,
    fileSize,
  });

  return successResponse({
    message: 'アップロード確認完了',
    imageId,
    s3Key,
    metadata: imageMetadata,
  });
});
