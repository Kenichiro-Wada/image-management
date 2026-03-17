import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, update, put } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const TAGS_TABLE = process.env.TAGS_TABLE || '';
const MAX_BULK_TAG = 100; // 一括タグ付けの最大件数

/**
 * 一括タグ追加ハンドラー
 * 
 * POST /api/admin/images/tags/bulk
 * 
 * リクエストボディ:
 * {
 *   "imageIds": ["id1", "id2", ...],
 *   "tags": ["タグ1", "タグ2", ...]
 * }
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('一括タグ追加処理開始', { requestId: context.awsRequestId });

  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { imageIds, tags } = body;

  // バリデーション
  if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
    throw new AppError('画像IDの配列が無効です', 400);
  }

  if (imageIds.length > MAX_BULK_TAG) {
    throw new AppError(`一度にタグ付けできる画像は${MAX_BULK_TAG}件までです`, 400);
  }

  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    throw new AppError('タグの配列が無効です', 400);
  }

  // タグ名の正規化とバリデーション
  const normalizedTags = tags
    .map((tag: string) => tag.trim())
    .filter((tag: string) => tag.length > 0 && tag.length <= 50);

  if (normalizedTags.length === 0) {
    throw new AppError('有効なタグがありません', 400);
  }

  // ユーザー情報の取得
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const cognitoGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
  let groups: string[] = [];

  if (typeof cognitoGroups === 'string') {
    try {
      if (cognitoGroups.startsWith('[')) {
        groups = JSON.parse(cognitoGroups);
      } else {
        groups = [cognitoGroups];
      }
    } catch {
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

  // Image_Managerはタグ編集不可
  if (userRole === 'Image_Manager') {
    throw new AppError('画像管理者はタグを編集できません', 403);
  }

  logger.info('ユーザー情報', { currentUserId, userRole, imageCount: imageIds.length, tagCount: normalizedTags.length });

  const successImages: string[] = [];
  const failedImages: Array<{ imageId: string; reason: string }> = [];

  for (const imageId of imageIds) {
    try {
      // 画像メタデータの取得
      const imageMetadata = await get({
        tableName: IMAGES_TABLE,
        key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
      });

      if (!imageMetadata) {
        failedImages.push({ imageId, reason: '画像が見つかりません' });
        continue;
      }

      // Regular_Userは自分の画像のみ
      if (userRole === 'Regular_User' && imageMetadata.ownerId !== currentUserId) {
        failedImages.push({ imageId, reason: '権限がありません' });
        continue;
      }

      // 既存タグと新規タグをマージ（重複排除）
      const existingTags: string[] = imageMetadata.tags || [];
      const mergedTags = [...new Set([...existingTags, ...normalizedTags])];

      // 変更がない場合はスキップ
      if (mergedTags.length === existingTags.length) {
        successImages.push(imageId);
        continue;
      }

      // 画像メタデータを更新
      await update({
        tableName: IMAGES_TABLE,
        key: { PK: `IMAGE#${imageId}`, SK: 'METADATA' },
        updateExpression: 'SET tags = :tags',
        expressionAttributeValues: { ':tags': mergedTags },
      });

      successImages.push(imageId);
    } catch (error) {
      logger.error('一括タグ追加エラー', { error, imageId });
      failedImages.push({
        imageId,
        reason: error instanceof Error ? error.message : '不明なエラー',
      });
    }
  }

  // タグ使用回数を更新
  for (const tagName of normalizedTags) {
    await updateTagUsageCount(tagName);
  }

  logger.info('一括タグ追加完了', { success: successImages.length, failed: failedImages.length });

  return successResponse({
    success: successImages.length,
    failed: failedImages.length,
    failedImages,
  });
});

/**
 * タグ使用回数を更新
 */
async function updateTagUsageCount(tagName: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    const tagMetadata = await get({
      tableName: TAGS_TABLE,
      key: { PK: `TAG#${tagName}`, SK: 'METADATA' },
    });

    if (tagMetadata) {
      await update({
        tableName: TAGS_TABLE,
        key: { PK: `TAG#${tagName}`, SK: 'METADATA' },
        updateExpression: 'SET usageCount = usageCount + :inc, lastUsedAt = :lastUsedAt',
        expressionAttributeValues: { ':inc': 1, ':lastUsedAt': now },
      });
    } else {
      await put({
        tableName: TAGS_TABLE,
        item: {
          PK: `TAG#${tagName}`,
          SK: 'METADATA',
          tagName,
          usageCount: 1,
          createdAt: now,
          lastUsedAt: now,
        },
      });
    }
  } catch (error) {
    logger.error('タグ使用回数更新エラー', { error, tagName });
  }
}
