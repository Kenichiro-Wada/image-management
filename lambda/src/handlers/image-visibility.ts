import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { get, update } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';

/**
 * 画像公開状態変更ハンドラー
 * 
 * PATCH /api/admin/images/:id/visibility
 * 
 * リクエストボディ:
 * {
 *   "isPublic": boolean
 * }
 * 
 * 機能:
 * - 画像の公開状態を変更
 * - GSI2PK、GSI2SKを更新（公開画像一覧用インデックス）
 * - 権限チェック（System_Admin、Image_Managerのみ許可）
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('公開状態変更処理開始', {
    requestId: context.awsRequestId,
  });

  // パスパラメータの取得
  const imageId = event.pathParameters?.id;
  if (!imageId) {
    throw new AppError('画像IDが指定されていません', 400);
  }

  // リクエストボディの解析
  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  let requestBody: { isPublic: boolean };
  try {
    requestBody = JSON.parse(event.body);
  } catch (error) {
    throw new AppError('リクエストボディのJSON解析に失敗しました', 400);
  }

  // isPublicのバリデーション
  if (typeof requestBody.isPublic !== 'boolean') {
    throw new AppError('isPublicはboolean型である必要があります', 400);
  }

  const { isPublic } = requestBody;

  // ユーザー情報の取得
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  
  // cognito:groupsは文字列または配列で来る可能性がある
  const cognitoGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
  let userGroups: string[] = [];
  
  if (typeof cognitoGroups === 'string') {
    // カンマ区切りの文字列の場合
    userGroups = cognitoGroups.split(',').map(g => g.trim());
  } else if (Array.isArray(cognitoGroups)) {
    userGroups = cognitoGroups;
  }
  
  const userRole = userGroups[0] || 'Regular_User';

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    userGroups,
    cognitoGroups,
    imageId,
    isPublic,
  });

  // 権限チェック: System_AdminまたはImage_Managerのみ許可
  if (!userGroups.includes('System_Admin') && !userGroups.includes('Image_Manager')) {
    throw new AppError('公開状態を変更する権限がありません', 403);
  }

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

    // 公開状態が既に同じ場合はスキップ
    if (imageMetadata.isPublic === isPublic) {
      logger.info('公開状態は既に同じ値です', {
        imageId,
        isPublic,
      });

      return successResponse({
        message: '公開状態は既に同じ値です',
        imageId,
        isPublic,
      });
    }

    // GSI2PK、GSI2SKの計算
    const gsi2pk = isPublic ? 'PUBLIC#true' : 'PUBLIC#false';
    const capturedAt = imageMetadata.capturedAt || imageMetadata.uploadedAt;
    const gsi2sk = `${capturedAt}#${imageId}`;

    // DynamoDBの更新
    await update({
      tableName: IMAGES_TABLE,
      key: {
        PK: `IMAGE#${imageId}`,
        SK: 'METADATA',
      },
      updateExpression: 'SET #isPublic = :isPublic, #GSI2PK = :gsi2pk, #GSI2SK = :gsi2sk',
      expressionAttributeNames: {
        '#isPublic': 'isPublic',
        '#GSI2PK': 'GSI2PK',
        '#GSI2SK': 'GSI2SK',
      },
      expressionAttributeValues: {
        ':isPublic': isPublic,
        ':gsi2pk': gsi2pk,
        ':gsi2sk': gsi2sk,
      },
    });

    logger.info('公開状態変更完了', {
      imageId,
      isPublic,
      gsi2pk,
      gsi2sk,
    });

    return successResponse({
      message: '公開状態を変更しました',
      imageId,
      isPublic,
    });
  } catch (error) {
    logger.error('公開状態変更エラー', { error, imageId });
    throw error;
  }
});
