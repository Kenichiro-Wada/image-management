import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { authenticate } from '../middleware/auth';
import { logger } from '../common/logger';

/**
 * トークン検証レスポンス
 */
interface VerifyResponse {
  valid: boolean;
  userId: string;
  email: string;
  role: string;
  groups: string[];
}

/**
 * トークン検証APIハンドラー
 * 
 * GET /api/admin/auth/verify
 * 
 * ヘッダー:
 * Authorization: Bearer <token>
 * 
 * 機能:
 * - JWTトークンの検証
 * - ユーザー情報の取得
 * 
 * Note: 実際の運用では、API Gateway Cognito Authorizerで自動的に検証される
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('トークン検証処理開始', {
    requestId: context.awsRequestId,
  });

  try {
    // トークンを検証してユーザー情報を取得
    const user = await authenticate(event);

    logger.info('トークン検証成功', {
      userId: user.userId,
      role: user.role,
    });

    const verifyResponse: VerifyResponse = {
      valid: true,
      userId: user.userId,
      email: user.email,
      role: user.role,
      groups: user.groups,
    };

    return successResponse(verifyResponse);
  } catch (error) {
    logger.error('トークン検証エラー', { error });
    throw new AppError('トークンが無効です', 401);
  }
});
