import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { authenticate } from '../middleware/auth';
import { get } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const USERS_TABLE = process.env.USERS_TABLE || '';

/**
 * ユーザー情報レスポンス
 */
interface UserInfoResponse {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  groups: string[];
  imageCount: number;
  storageUsed: number;
  createdAt: string;
  lastLoginAt: string;
}

/**
 * ユーザー情報取得APIハンドラー
 * 
 * GET /api/admin/auth/user
 * 
 * ヘッダー:
 * Authorization: Bearer <token>
 * 
 * 機能:
 * - 認証済みユーザーの詳細情報を取得
 * - DynamoDBからユーザープロファイルを取得
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('ユーザー情報取得処理開始', {
    requestId: context.awsRequestId,
  });

  try {
    // トークンを検証してユーザー情報を取得
    const user = await authenticate(event);

    logger.info('ユーザー情報取得', {
      userId: user.userId,
    });

    // DynamoDBからユーザープロファイルを取得
    const userProfile = await get({
      tableName: USERS_TABLE,
      key: {
        PK: `USER#${user.userId}`,
        SK: 'PROFILE',
      },
    });

    // ユーザープロファイルが存在しない場合は基本情報のみ返す
    if (!userProfile) {
      logger.warn('ユーザープロファイルが見つかりません', {
        userId: user.userId,
      });

      const basicUserInfo: UserInfoResponse = {
        userId: user.userId,
        email: user.email,
        displayName: user.email.split('@')[0], // メールアドレスの@前を表示名として使用
        role: user.role,
        groups: user.groups,
        imageCount: 0,
        storageUsed: 0,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      return successResponse(basicUserInfo);
    }

    // 最終ログイン日時を更新（非同期で実行）
    updateLastLoginAt(user.userId).catch((error) => {
      logger.error('最終ログイン日時の更新に失敗', { error, userId: user.userId });
    });

    const userInfoResponse: UserInfoResponse = {
      userId: userProfile.userId,
      email: userProfile.email,
      displayName: userProfile.displayName || user.email.split('@')[0],
      role: user.role,
      groups: user.groups,
      imageCount: userProfile.imageCount || 0,
      storageUsed: userProfile.storageUsed || 0,
      createdAt: userProfile.createdAt,
      lastLoginAt: userProfile.lastLoginAt,
    };

    logger.info('ユーザー情報取得完了', {
      userId: user.userId,
    });

    return successResponse(userInfoResponse);
  } catch (error) {
    logger.error('ユーザー情報取得エラー', { error });
    throw error;
  }
});

/**
 * 最終ログイン日時を更新
 */
async function updateLastLoginAt(userId: string): Promise<void> {
  const { update } = await import('../common/dynamodb-client');
  
  await update({
    tableName: USERS_TABLE,
    key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
    updateExpression: 'SET #lastLoginAt = :lastLoginAt',
    expressionAttributeNames: {
      '#lastLoginAt': 'lastLoginAt',
    },
    expressionAttributeValues: {
      ':lastLoginAt': new Date().toISOString(),
    },
  });
}
