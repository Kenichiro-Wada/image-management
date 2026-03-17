import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, update } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const MAX_BULK_UPDATE = 50; // 一括更新の最大件数

/**
 * 一括公開状態変更ハンドラー
 * 
 * PATCH /api/admin/images/visibility/bulk
 * 
 * リクエストボディ:
 * {
 *   "imageIds": ["id1", "id2", "id3"],
 *   "isPublic": true
 * }
 * 
 * 機能:
 * - 複数の画像の公開状態を一括変更
 * - System_Admin、Image_Managerのみ実行可能
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('一括公開状態変更処理開始', {
    requestId: context.awsRequestId,
  });

  // リクエストボディの取得
  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  const body = JSON.parse(event.body);
  const { imageIds, isPublic } = body;

  // バリデーション
  if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
    throw new AppError('画像IDの配列が無効です', 400);
  }

  if (typeof isPublic !== 'boolean') {
    throw new AppError('isPublicはboolean型である必要があります', 400);
  }

  if (imageIds.length > MAX_BULK_UPDATE) {
    throw new AppError(`一度に更新できる画像は${MAX_BULK_UPDATE}件までです`, 400);
  }

  // ユーザー情報の取得
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  
  // Cognitoグループの取得（文字列または配列で来る可能性に対応）
  const cognitoGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
  let groups: string[] = [];
  
  if (typeof cognitoGroups === 'string') {
    try {
      if (cognitoGroups.startsWith('[')) {
        groups = JSON.parse(cognitoGroups);
      } else {
        groups = [cognitoGroups];
      }
    } catch (error) {
      logger.warn('Cognitoグループのパースに失敗', { cognitoGroups, error });
      groups = [cognitoGroups];
    }
  } else if (Array.isArray(cognitoGroups)) {
    groups = cognitoGroups;
  }
  
  // ユーザーロールの判定
  let userRole = 'Regular_User';
  if (groups.includes('System_Admin')) {
    userRole = 'System_Admin';
  } else if (groups.includes('Image_Manager')) {
    userRole = 'Image_Manager';
  }

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    groups,
    imageCount: imageIds.length,
    isPublic,
  });

  // 権限チェック（System_Admin、Image_Managerのみ）
  if (userRole !== 'System_Admin' && userRole !== 'Image_Manager') {
    throw new AppError('公開状態を変更する権限がありません', 403);
  }

  try {
    const updatedImages: string[] = [];
    const failedImages: Array<{ imageId: string; reason: string }> = [];

    // 各画像の公開状態を更新
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
          failedImages.push({
            imageId,
            reason: '画像が見つかりません',
          });
          continue;
        }

        // 公開状態を更新
        const capturedAt = imageMetadata.capturedAt || imageMetadata.uploadedAt;
        
        await update({
          tableName: IMAGES_TABLE,
          key: {
            PK: `IMAGE#${imageId}`,
            SK: 'METADATA',
          },
          updateExpression: 'SET isPublic = :isPublic, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
          expressionAttributeValues: {
            ':isPublic': isPublic,
            ':gsi2pk': `PUBLIC#${isPublic}`,
            ':gsi2sk': `${capturedAt}#${imageId}`,
          },
        });

        updatedImages.push(imageId);

        logger.info('画像の公開状態を更新', {
          imageId,
          isPublic,
        });
      } catch (error) {
        logger.error('画像更新エラー', { error, imageId });
        failedImages.push({
          imageId,
          reason: error instanceof Error ? error.message : '不明なエラー',
        });
      }
    }

    logger.info('一括公開状態変更完了', {
      successCount: updatedImages.length,
      failedCount: failedImages.length,
    });

    return successResponse({
      message: `${updatedImages.length}件の画像の公開状態を変更しました`,
      updatedImages,
      failedImages,
      summary: {
        total: imageIds.length,
        success: updatedImages.length,
        failed: failedImages.length,
      },
    });
  } catch (error) {
    logger.error('一括公開状態変更エラー', { error });
    throw error;
  }
});
