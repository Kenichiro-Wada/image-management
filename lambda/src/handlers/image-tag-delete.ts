import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, update } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const TAGS_TABLE = process.env.TAGS_TABLE || '';

/**
 * タグ削除ハンドラー
 * 
 * DELETE /api/admin/images/:id/tags/:tagName
 * 
 * 機能:
 * - 画像からタグを削除
 * - タグ使用回数の更新
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('タグ削除処理開始', {
    requestId: context.awsRequestId,
  });

  // パスパラメータの取得
  const imageId = event.pathParameters?.id;
  const tagName = event.pathParameters?.tagName;

  if (!imageId) {
    throw new AppError('画像IDが指定されていません', 400);
  }

  if (!tagName) {
    throw new AppError('タグ名が指定されていません', 400);
  }

  // タグ名のデコード（URLエンコードされている可能性があるため）
  const decodedTagName = decodeURIComponent(tagName);

  // ユーザー情報の取得（TODO: タスク3.9で認証実装後に修正）
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const userRole = event.requestContext.authorizer?.claims?.['cognito:groups']?.[0] || 'Regular_User';

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    imageId,
    tagName: decodedTagName,
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

    // タグが存在するかチェック
    if (!existingTags.includes(decodedTagName)) {
      throw new AppError('指定されたタグは存在しません', 404);
    }

    // タグを削除
    const updatedTags = existingTags.filter(tag => tag !== decodedTagName);

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

    // タグ使用回数を減らす
    await decrementTagUsageCount(decodedTagName);

    logger.info('タグ削除完了', {
      imageId,
      tagName: decodedTagName,
      remainingTags: updatedTags.length,
    });

    return successResponse({
      message: 'タグを削除しました',
      imageId,
      tagName: decodedTagName,
      tags: updatedTags,
    });
  } catch (error) {
    logger.error('タグ削除エラー', { error, imageId, tagName: decodedTagName });
    throw error;
  }
});

/**
 * タグ使用回数を減らす
 */
async function decrementTagUsageCount(tagName: string): Promise<void> {
  try {
    // タグメタデータの取得
    const tagMetadata = await get({
      tableName: TAGS_TABLE,
      key: {
        PK: `TAG#${tagName}`,
        SK: 'METADATA',
      },
    });

    if (tagMetadata && tagMetadata.usageCount > 0) {
      // 使用回数を減らす
      await update({
        tableName: TAGS_TABLE,
        key: {
          PK: `TAG#${tagName}`,
          SK: 'METADATA',
        },
        updateExpression: 'SET usageCount = usageCount - :dec',
        expressionAttributeValues: {
          ':dec': 1,
        },
      });
    }
  } catch (error) {
    logger.error('タグ使用回数更新エラー', { error, tagName });
    // タグ使用回数の更新失敗は致命的ではないため、エラーをログに記録するのみ
  }
}
