import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, put, update, query } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';

/**
 * レーティング追加・更新ハンドラー
 * 
 * POST /api/admin/images/{id}/rating
 * リクエストボディ: { "rating": 1〜5 }
 * 
 * GET /api/admin/images/{id}/rating
 * レスポンス: { averageRating, ratingCount, myRating }
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const imageId = event.pathParameters?.id;
  if (!imageId) {
    throw new AppError('画像IDが指定されていません', 400);
  }

  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';

  if (event.httpMethod === 'GET') {
    return handleGetRating(imageId, currentUserId);
  } else if (event.httpMethod === 'POST') {
    return handlePostRating(event, imageId, currentUserId);
  }

  throw new AppError('サポートされていないHTTPメソッドです', 405);
});

/**
 * レーティング取得
 */
async function handleGetRating(
  imageId: string,
  currentUserId: string
): Promise<APIGatewayProxyResult> {
  logger.info('レーティング取得', { imageId, currentUserId });

  // 画像メタデータの存在確認
  const imageMetadata = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
  });

  if (!imageMetadata) {
    throw new AppError('画像が見つかりません', 404);
  }

  // 自分のレーティングを取得
  const myRatingRecord = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: `RATING#${currentUserId}` },
  });

  return successResponse({
    averageRating: imageMetadata.averageRating || 0,
    ratingCount: imageMetadata.ratingCount || 0,
    myRating: myRatingRecord ? myRatingRecord.rating : null,
  });
}

/**
 * レーティング追加・更新
 */
async function handlePostRating(
  event: APIGatewayProxyEvent,
  imageId: string,
  currentUserId: string
): Promise<APIGatewayProxyResult> {
  logger.info('レーティング追加・更新', { imageId, currentUserId });

  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { rating } = body;

  // バリデーション
  if (rating === undefined || rating === null) {
    throw new AppError('レーティングが指定されていません', 400);
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new AppError('レーティングは1〜5の整数で指定してください', 400);
  }

  // 画像メタデータの存在確認
  const imageMetadata = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
  });

  if (!imageMetadata) {
    throw new AppError('画像が見つかりません', 404);
  }

  // 既存のレーティングを確認
  const existingRating = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: `RATING#${currentUserId}` },
  });

  const now = new Date().toISOString();

  // レーティングレコードを保存（upsert）
  await put({
    tableName: IMAGES_TABLE,
    item: {
      PK: `IMAGE#${imageId}`,
      SK: `RATING#${currentUserId}`,
      imageId,
      userId: currentUserId,
      rating: ratingNum,
      ratedAt: now,
    },
  });

  // 平均レーティングと評価数を再計算
  const { averageRating, ratingCount } = await recalculateRating(imageId, existingRating, ratingNum);

  return successResponse({
    averageRating,
    ratingCount,
    myRating: ratingNum,
  });
}

/**
 * 平均レーティングを再計算してメタデータを更新
 */
async function recalculateRating(
  imageId: string,
  existingRating: Record<string, any> | undefined,
  newRating: number
): Promise<{ averageRating: number; ratingCount: number }> {
  // 全レーティングレコードを取得
  const result = await query({
    tableName: IMAGES_TABLE,
    keyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    expressionAttributeValues: {
      ':pk': `IMAGE#${imageId}`,
      ':skPrefix': 'RATING#',
    },
  });

  const ratings = result.Items || [];
  const ratingCount = ratings.length;
  const totalRating = ratings.reduce((sum: number, item: any) => sum + (item.rating || 0), 0);
  const averageRating = ratingCount > 0 ? Math.round((totalRating / ratingCount) * 10) / 10 : 0;

  // 画像メタデータを更新
  await update({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
    updateExpression: 'SET averageRating = :avg, ratingCount = :cnt',
    expressionAttributeValues: {
      ':avg': averageRating,
      ':cnt': ratingCount,
    },
  });

  logger.info('レーティング再計算完了', { imageId, averageRating, ratingCount });

  return { averageRating, ratingCount };
}
