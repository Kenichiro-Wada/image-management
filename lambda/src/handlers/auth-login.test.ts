import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定（ハンドラーのインポート前）
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.AWS_REGION = 'ap-northeast-1';

// Cognitoクライアントのモック
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({
    send: mockSend,
  })),
  InitiateAuthCommand: jest.fn((params) => params),
}));

jest.mock('../common/logger');

import { handler } from './auth-login';

describe('ログインハンドラー', () => {
  const mockContext: Context = {
    awsRequestId: 'test-request-id',
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
    memoryLimitInMB: '512',
    logGroupName: '/aws/lambda/test',
    logStreamName: '2024/01/01/[$LATEST]test',
    callbackWaitsForEmptyEventLoop: true,
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    it('有効な認証情報でログインできる', async () => {
      // Arrange
      const mockAuthResult = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          ExpiresIn: 3600,
          TokenType: 'Bearer',
        },
      };

      mockSend.mockResolvedValue(mockAuthResult);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.accessToken).toBe('mock-access-token');
      expect(body.data.idToken).toBe('mock-id-token');
      expect(body.data.refreshToken).toBe('mock-refresh-token');
      expect(body.data.expiresIn).toBe(3600);
      expect(body.data.tokenType).toBe('Bearer');
    });

    it('ExpiresInとTokenTypeがない場合はデフォルト値を使用する', async () => {
      // Arrange
      const mockAuthResult = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          IdToken: 'mock-id-token',
          RefreshToken: 'mock-refresh-token',
          // ExpiresInとTokenTypeなし
        },
      };

      mockSend.mockResolvedValue(mockAuthResult);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.expiresIn).toBe(3600); // デフォルト値
      expect(body.data.tokenType).toBe('Bearer'); // デフォルト値
    });
  });

  describe('異常系', () => {
    it('リクエストボディが空の場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: null,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('リクエストボディが空です');
    });

    it('リクエストボディのJSON解析に失敗した場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: 'invalid-json',
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('JSON解析に失敗');
    });

    it('メールアドレスが空の場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: '',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('メールアドレスとパスワードは必須です');
    });

    it('パスワードが空の場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: '',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('メールアドレスとパスワードは必須です');
    });

    it('認証結果がない場合はエラーを返す', async () => {
      // Arrange
      mockSend.mockResolvedValue({
        // AuthenticationResultなし
      });

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('認証に失敗しました');
    });

    it('トークンが不完全な場合はエラーを返す', async () => {
      // Arrange
      mockSend.mockResolvedValue({
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          // IdTokenとRefreshTokenなし
        },
      });

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('トークンの取得に失敗しました');
    });

    it('認証が拒否された場合はエラーを返す（NotAuthorizedException）', async () => {
      // Arrange
      const error = new Error('Incorrect username or password');
      error.name = 'NotAuthorizedException';
      mockSend.mockRejectedValue(error);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrong-password',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('メールアドレスまたはパスワードが正しくありません');
    });

    it('ユーザーが見つからない場合はエラーを返す（UserNotFoundException）', async () => {
      // Arrange
      const error = new Error('User does not exist');
      error.name = 'UserNotFoundException';
      mockSend.mockRejectedValue(error);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('ユーザーが見つかりません');
    });

    it('ユーザーが確認されていない場合はエラーを返す（UserNotConfirmedException）', async () => {
      // Arrange
      const error = new Error('User is not confirmed');
      error.name = 'UserNotConfirmedException';
      mockSend.mockRejectedValue(error);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'unconfirmed@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('ユーザーが確認されていません');
    });

    it('パスワードリセットが必要な場合はエラーを返す（PasswordResetRequiredException）', async () => {
      // Arrange
      const error = new Error('Password reset required');
      error.name = 'PasswordResetRequiredException';
      mockSend.mockRejectedValue(error);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'reset@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('パスワードのリセットが必要です');
    });

    it('リクエストが多すぎる場合はエラーを返す（TooManyRequestsException）', async () => {
      // Arrange
      const error = new Error('Too many requests');
      error.name = 'TooManyRequestsException';
      mockSend.mockRejectedValue(error);

      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(429);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('リクエストが多すぎます');
    });
  });
});
