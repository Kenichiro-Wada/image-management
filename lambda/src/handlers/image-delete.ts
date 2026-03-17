import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, deleteItem } from '../common/dynamodb-client';
import { deleteObject } from '../common/s3-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const IMAGES_BUCKET = process.env.IMAGES_BUCKET || '';
const THUMBNAILS_BUCKET = process.env.THUMBNAILS_BUCKET || '';

/**
 * 画像削除ハンドラー
 * 
 * DELETE /api/admin/images/:id
 * 
 * 機能:
 * - 画像をS3から削除
 * - サムネイルをS3から削除
 * - メタデータをDynamoDBから削除
 * - 権限チェック
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('画像削除処理開始', {
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
    if (userRole === 'Regular_User' && imageMetadata.ownerId !== currentUserId) {
      throw new AppError('この画像を削除する権限がありません', 403);
    }

    // Image_Managerは削除不可
    if (userRole === 'Image_Manager') {
      throw new AppError('画像管理者は画像を削除できません', 403);
    }

    // S3から元画像を削除
    if (imageMetadata.s3Key) {
      await deleteObject({
        bucket: IMAGES_BUCKET,
        key: imageMetadata.s3Key,
      });
      logger.info('元画像を削除しました', { s3Key: imageMetadata.s3Key });
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
      logger.info('サムネイルを削除しました', { thumbnailKeys });
    }

    // DynamoDBからメタデータを削除
    await deleteItem({
      tableName: IMAGES_TABLE,
      key: {
        PK: `IMAGE#${imageId}`,
        SK: 'METADATA',
      },
    });

    logger.info('画像削除完了', {
      imageId,
      fileName: imageMetadata.fileName,
    });

    return successResponse({
      message: '画像を削除しました',
      imageId,
      fileName: imageMetadata.fileName,
    });
  } catch (error) {
    logger.error('画像削除エラー', { error, imageId });
    throw error;
  }
});
