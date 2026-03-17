import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, put, deleteItem, update } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';

/**
 * Like追加・解除ハンドラー（ビューアー用・認証不要）
 * 
 * POST /api/public/images/{id}/like
 * リクエストボディ: { "visitorId": "ブラウザ固有ID" }
 * → Like追加
 * 
 * DELETE /api/public/images/{id}/like
 * クエリパラメータ: visitorId=xxx
 * → Like解除
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const imageId = event.pathParameters?.id;
  if (!imageId) {
    throw new AppError('画像IDが指定されていません', 400);
  }

  if (event.httpMethod === 'POST') {
    return handleAddLike(event, imageId);
  } else if (event.httpMethod === 'DELETE') {
    return handleRemoveLike(event, imageId);
  }

  throw new AppError('サポートされていないHTTPメソッドです', 405);
});

/**
 * Like追加
 */
async function handleAddLike(
  event: APIGatewayProxyEvent,
  imageId: string
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { visitorId } = body;

  if (!visitorId || typeof visitorId !== 'string') {
    throw new AppError('visitorIdが指定されていません', 400);
  }

  logger.info('Like追加', { imageId, visitorId });

  // 画像メタデータの存在確認
  const imageMetadata = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
  });

  if (!imageMetadata) {
    throw new AppError('画像が見つかりません', 404);
  }

  // 既にLike済みかチェック
  const existingLike = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: `LIKE#${visitorId}` },
  });

  if (existingLike) {
    // 既にLike済み → 現在のカウントを返す
    return successResponse({
      liked: true,
      likeCount: imageMetadata.likeCount || 0,
    });
  }

  const now = new Date().toISOString();

  // Likeレコードを保存
  await put({
    tableName: IMAGES_TABLE,
    item: {
      PK: `IMAGE#${imageId}`,
      SK: `LIKE#${visitorId}`,
      imageId,
      visitorId,
      likedAt: now,
    },
  });

  // likeCountをアトミックにインクリメント
  const updated = await update({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
    updateExpression: 'SET likeCount = if_not_exists(likeCount, :zero) + :one',
    expressionAttributeValues: {
      ':zero': 0,
      ':one': 1,
    },
  });

  const newLikeCount = updated?.likeCount || (imageMetadata.likeCount || 0) + 1;

  return successResponse({
    liked: true,
    likeCount: newLikeCount,
  });
}

/**
 * Like解除
 */
async function handleRemoveLike(
  event: APIGatewayProxyEvent,
  imageId: string
): Promise<APIGatewayProxyResult> {
  const visitorId = event.queryStringParameters?.visitorId;

  if (!visitorId) {
    throw new AppError('visitorIdが指定されていません', 400);
  }

  logger.info('Like解除', { imageId, visitorId });

  // 画像メタデータの存在確認
  const imageMetadata = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
  });

  if (!imageMetadata) {
    throw new AppError('画像が見つかりません', 404);
  }

  // Likeレコードの存在確認
  const existingLike = await get({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: `LIKE#${visitorId}` },
  });

  if (!existingLike) {
    // Like済みでない → 現在のカウントを返す
    return successResponse({
      liked: false,
      likeCount: imageMetadata.likeCount || 0,
    });
  }

  // Likeレコードを削除
  await deleteItem({
    tableName: IMAGES_TABLE,
    key: { PK: `IMAGE#${imageId}`, SK: `LIKE#${visitorId}` },
  });

  // likeCountをアトミックにデクリメント（0未満にならないよう制御）
  const currentCount = imageMetadata.likeCount || 0;
  if (currentCount > 0) {
    await update({
      tableName: IMAGES_TABLE,
      key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
      updateExpression: 'SET likeCount = likeCount - :one',
      expressionAttributeValues: {
        ':one': 1,
      },
    });
  }

  const newLikeCount = Math.max(0, currentCount - 1);

  return successResponse({
    liked: false,
    likeCount: newLikeCount,
  });
}
