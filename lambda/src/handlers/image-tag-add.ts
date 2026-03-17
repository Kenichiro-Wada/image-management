import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, update, put } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const TAGS_TABLE = process.env.TAGS_TABLE || '';

/**
 * タグ追加ハンドラー
 * 
 * POST /api/admin/images/:id/tags
 * 
 * リクエストボディ:
 * {
 *   "tagName": "風景"
 * }
 * 
 * 機能:
 * - 画像にタグを追加
 * - タグ重複チェック
 * - タグ使用回数の更新
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('タグ追加処理開始', {
    requestId: context.awsRequestId,
  });

  // パスパラメータの取得
  const imageId = event.pathParameters?.id;
  if (!imageId) {
    throw new AppError('画像IDが指定されていません', 400);
  }

  // リクエストボディの取得
  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { tagName } = body;

  // バリデーション
  if (!tagName || typeof tagName !== 'string') {
    throw new AppError('タグ名が無効です', 400);
  }

  // タグ名の正規化（前後の空白を削除）
  const normalizedTagName = tagName.trim();
  if (normalizedTagName.length === 0) {
    throw new AppError('タグ名が空です', 400);
  }

  if (normalizedTagName.length > 50) {
    throw new AppError('タグ名は50文字以内である必要があります', 400);
  }

  // ユーザー情報の取得（TODO: タスク3.9で認証実装後に修正）
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const userRole = event.requestContext.authorizer?.claims?.['cognito:groups']?.[0] || 'Regular_User';

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    imageId,
    tagName: normalizedTagName,
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
    if (userRole === 'Regular_User' && imageMetadata.ownerId !== currentUserId) {
      throw new AppError('この画像を編集する権限がありません', 403);
    }

    // Image_Managerは編集不可
    if (userRole === 'Image_Manager') {
      throw new AppError('画像管理者は画像を編集できません', 403);
    }

    // 既存のタグを取得
    const existingTags: string[] = imageMetadata.tags || [];

    // タグ重複チェック
    if (existingTags.includes(normalizedTagName)) {
      throw new AppError('このタグは既に追加されています', 400);
    }

    // タグを追加
    const updatedTags = [...existingTags, normalizedTagName];

    // 画像メタデータを更新
    await update({
      tableName: IMAGES_TABLE,
      key: {
        PK: `IMAGE#${imageId}`,
        SK: 'METADATA',
      },
      updateExpression: 'SET tags = :tags',
      expressionAttributeValues: {
        ':tags': updatedTags,
      },
    });

    // タグ使用回数を更新
    await updateTagUsageCount(normalizedTagName);

    logger.info('タグ追加完了', {
      imageId,
      tagName: normalizedTagName,
      totalTags: updatedTags.length,
    });

    return successResponse({
      message: 'タグを追加しました',
      imageId,
      tagName: normalizedTagName,
      tags: updatedTags,
    });
  } catch (error) {
    logger.error('タグ追加エラー', { error, imageId, tagName: normalizedTagName });
    throw error;
  }
});

/**
 * タグ使用回数を更新
 */
async function updateTagUsageCount(tagName: string): Promise<void> {
  const now = new Date().toISOString();

  try {
    // タグメタデータの取得
    const tagMetadata = await get({
      tableName: TAGS_TABLE,
      key: {
        PK: `TAG#${tagName}`,
        SK: 'METADATA',
      },
    });

    if (tagMetadata) {
      // 既存のタグの場合は使用回数を増やす
      await update({
        tableName: TAGS_TABLE,
        key: {
          PK: `TAG#${tagName}`,
          SK: 'METADATA',
        },
        updateExpression: 'SET usageCount = usageCount + :inc, lastUsedAt = :lastUsedAt',
        expressionAttributeValues: {
          ':inc': 1,
          ':lastUsedAt': now,
        },
      });
    } else {
      // 新しいタグの場合は作成
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
    // タグ使用回数の更新失敗は致命的ではないため、エラーをログに記録するのみ
  }
}
