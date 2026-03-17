import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { logger } from '../common/logger';

// 環境変数
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-1';

// Cognitoクライアント
const cognitoClient = new CognitoIdentityProviderClient({
  region: AWS_REGION,
});

/**
 * ログインリクエスト
 */
interface LoginRequest {
  email: string;
  password: string;
}

/**
 * ログインレスポンス
 */
interface LoginResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * ログインAPIハンドラー
 * 
 * POST /api/admin/auth/login
 * 
 * リクエストボディ:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * 
 * 機能:
 * - Cognitoを使用したユーザー認証
 * - アクセストークン、IDトークン、リフレッシュトークンの発行
 * 
 * Note: 実際の運用では、フロントエンドから直接Cognito SDKを使用することを推奨
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('ログイン処理開始', {
    requestId: context.awsRequestId,
  });

  // リクエストボディの解析
  if (!event.body) {
    throw new AppError('リクエストボディが空です', 400);
  }

  let requestBody: LoginRequest;
  try {
    requestBody = JSON.parse(event.body);
  } catch (error) {
    throw new AppError('リクエストボディのJSON解析に失敗しました', 400);
  }

  // バリデーション
  if (!requestBody.email || !requestBody.password) {
    throw new AppError('メールアドレスとパスワードは必須です', 400);
  }

  const { email, password } = requestBody;

  try {
    // Cognitoでユーザー認証
    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: USER_POOL_CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await cognitoClient.send(command);

    if (!response.AuthenticationResult) {
      throw new AppError('認証に失敗しました', 401);
    }

    const { AccessToken, IdToken, RefreshToken, ExpiresIn, TokenType } = response.AuthenticationResult;

    if (!AccessToken || !IdToken || !RefreshToken) {
      throw new AppError('トークンの取得に失敗しました', 500);
    }

    logger.info('ログイン成功', {
      email,
    });

    const loginResponse: LoginResponse = {
      accessToken: AccessToken,
      idToken: IdToken,
      refreshToken: RefreshToken,
      expiresIn: ExpiresIn || 3600,
      tokenType: TokenType || 'Bearer',
    };

    return successResponse(loginResponse);
  } catch (error: any) {
    logger.error('ログインエラー', { error, email });

    // Cognitoエラーのハンドリング
    if (error.name === 'NotAuthorizedException') {
      throw new AppError('メールアドレスまたはパスワードが正しくありません', 401);
    }
    if (error.name === 'UserNotFoundException') {
      throw new AppError('ユーザーが見つかりません', 404);
    }
    if (error.name === 'UserNotConfirmedException') {
      throw new AppError('ユーザーが確認されていません', 403);
    }
    if (error.name === 'PasswordResetRequiredException') {
      throw new AppError('パスワードのリセットが必要です', 403);
    }
    if (error.name === 'TooManyRequestsException') {
      throw new AppError('リクエストが多すぎます。しばらくしてから再試行してください', 429);
    }

    throw error;
  }
});
