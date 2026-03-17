import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, deleteItem } from '../common/dynamodb-client';
import { deleteObject } from '../common/s3-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const THUMBNAILS_BUCKET = process.env.THUMBNAILS_BUCKET || '';
const MAX_BULK_DELETE = 100; // 一括削除の最大件数

/**
 * 一括画像削除ハンドラー
 * 
 * DELETE /api/admin/images/bulk
 * 
 * リクエストボディ:
 * {
 *   "imageIds": ["id1", "id2", "id3"]
 * }
 * 
 * 機能:
 * - 複数の画像を一括削除
 * - 各画像の権限チェック
 * - エラーが発生した画像はスキップして続行
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('一括画像削除処理開始', {
    requestId: context.awsRequestId,
  });

  // リクエストボディの取得
  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { imageIds } = body;

  // バリデーション
  if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
    throw new AppError('画像IDの配列が無効です', 400);
  }

  if (imageIds.length > MAX_BULK_DELETE) {
    throw new AppError(`一度に削除できる画像は${MAX_BULK_DELETE}件までです`, 400);
  }

  // ユーザー情報の取得（TODO: タスク3.9で認証実装後に修正）
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  const userRole = event.requestContext.authorizer?.claims?.['cognito:groups']?.[0] || 'Regular_User';

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    imageCount: imageIds.length,
  });

  // Image_Managerは削除不可
  if (userRole === 'Image_Manager') {
    throw new AppError('画像管理者は画像を削除できません', 403);
  }

  const results = {
    success: [] as string[],
    failed: [] as Array<{ imageId: string; reason: string }>,
  };

  // 各画像を削除
  for (const imageId of imageIds) {
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
        results.failed.push({
          imageId,
          reason: '画像が見つかりません',
        });
        continue;
      }

      // 権限チェック
      if (userRole === 'Regular_User' && imageMetadata.ownerId !== currentUserId) {
        results.failed.push({
          imageId,
          reason: '削除する権限がありません',
        });
        continue;
      }

      // S3から元画像を削除
      if (imageMetadata.s3Key) {
        await deleteObject({
          bucket: IMAGES_BUCKET,
          key: imageMetadata.s3Key,
        });
      }

      // S3からサムネイルを削除
      if (imageMetadata.thumbnailKeys) {
        const thumbnailKeys = imageMetadata.thumbnailKeys;
        const deletePromises = [];

        if (thumbnailKeys.small) {
          deletePromises.push(
            deleteObject({
              bucket: THUMBNAILS_BUCKET,
              key: thumbnailKeys.small,
            })
          );
        }

        if (thumbnailKeys.medium) {
          deletePromises.push(
            deleteObject({
              bucket: THUMBNAILS_BUCKET,
              key: thumbnailKeys.medium,
            })
          );
        }

        if (thumbnailKeys.large) {
          deletePromises.push(
            deleteObject({
              bucket: THUMBNAILS_BUCKET,
              key: thumbnailKeys.large,
            })
          );
        }

        await Promise.all(deletePromises);
      }

      // DynamoDBからメタデータを削除
      await deleteItem({
        tableName: IMAGES_TABLE,
        key: {
          PK: `IMAGE#${imageId}`,
          SK: 'METADATA',
        },
      });

      results.success.push(imageId);
      logger.info('画像削除成功', { imageId });
    } catch (error) {
      logger.error('画像削除エラー', { error, imageId });
      results.failed.push({
        imageId,
        reason: error instanceof Error ? error.message : '不明なエラー',
      });
    }
  }

  logger.info('一括画像削除完了', {
    successCount: results.success.length,
    failedCount: results.failed.length,
  });

  return successResponse({
    message: '一括削除処理が完了しました',
    results,
    summary: {
      total: imageIds.length,
      success: results.success.length,
      failed: results.failed.length,
    },
  });
});
