import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定（ハンドラーのインポート前）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.TAGS_TABLE = 'test-tags-table';

import { handler } from './image-tag-add';

// モック設定
jest.mock('../common/dynamodb-client', () => ({
  get: jest.fn(),
  update: jest.fn(),
  put: jest.fn(),
}));

jest.mock('../common/logger');

import * as dynamodbClient from '../common/dynamodb-client';

describe('タグ追加ハンドラー', () => {
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
    it('有効なタグを画像に追加できる', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        fileName: 'test.jpg',
        tags: ['existing-tag'],
        ownerId: 'test-user',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(mockImageMetadata);
      (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(null); // タグメタデータは存在しない
      (dynamodbClient.update as jest.Mock).mockResolvedValue({});
      (dynamodbClient.put as jest.Mock).mockResolvedValue({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: 'new-tag',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user',
              'cognito:groups': ['System_Admin'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('タグを追加しました');
      expect(body.data.tagName).toBe('new-tag');
      expect(body.data.tags).toContain('new-tag');
      expect(body.data.tags).toContain('existing-tag');

      // DynamoDBの更新が呼ばれたことを確認
      expect(dynamodbClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'test-images-table',
          key: {
            PK: 'IMAGE#test-image-id',
            SK: 'METADATA',
          },
          updateExpression: 'SET tags = :tags',
          expressionAttributeValues: {
            ':tags': ['existing-tag', 'new-tag'],
          },
        })
      );

      // タグメタデータの作成が呼ばれたことを確認
      expect(dynamodbClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'test-tags-table',
          item: expect.objectContaining({
            PK: 'TAG#new-tag',
            SK: 'METADATA',
            tagName: 'new-tag',
            usageCount: 1,
          }),
        })
      );
    });

    it('既存のタグの使用回数を増やす', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        tags: [],
        ownerId: 'test-user',
      };

      const mockTagMetadata = {
        PK: 'TAG#existing-tag',
        SK: 'METADATA',
        tagName: 'existing-tag',
        usageCount: 5,
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(mockImageMetadata);
      (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(mockTagMetadata);
      (dynamodbClient.update as jest.Mock).mockResolvedValue({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: 'existing-tag',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user',
              'cognito:groups': ['System_Admin'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);

      // タグ使用回数の更新が呼ばれたことを確認
      expect(dynamodbClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'test-tags-table',
          key: {
            PK: 'TAG#existing-tag',
            SK: 'METADATA',
          },
          updateExpression: 'SET usageCount = usageCount + :inc, lastUsedAt = :lastUsedAt',
        })
      );
    });

    it('タグ名の前後の空白を削除する', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        tags: [],
        ownerId: 'test-user',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(mockImageMetadata);
      (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(null);
      (dynamodbClient.update as jest.Mock).mockResolvedValue({});
      (dynamodbClient.put as jest.Mock).mockResolvedValue({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: '  trimmed-tag  ',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user',
              'cognito:groups': ['System_Admin'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.tagName).toBe('trimmed-tag');
    });
  });

  describe('異常系', () => {
    it('画像IDが指定されていない場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: null,
        body: JSON.stringify({
          tagName: 'test-tag',
        }),
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('画像IDが指定されていません');
    });

    it('リクエストボディが空の場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: null,
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('リクエストボディが空です');
    });

    it('タグ名が無効な場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: '   ',  // 空白のみ
        }),
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('タグ名が空です');
    });

    it('タグ名が50文字を超える場合はエラーを返す', async () => {
      // Arrange
      const longTagName = 'a'.repeat(51);
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: longTagName,
        }),
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('50文字以内');
    });

    it('画像が見つからない場合はエラーを返す', async () => {
      // Arrange
      (dynamodbClient.get as jest.Mock).mockResolvedValue(null);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'non-existent-id',
        },
        body: JSON.stringify({
          tagName: 'test-tag',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user',
              'cognito:groups': ['System_Admin'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('画像が見つかりません');
    });

    it('重複するタグを追加しようとするとエラーを返す', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        tags: ['existing-tag'],
        ownerId: 'test-user',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: 'existing-tag',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user',
              'cognito:groups': ['System_Admin'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('既に追加されています');
    });

    it('Regular_Userが他人の画像にタグを追加しようとするとエラーを返す', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        tags: [],
        ownerId: 'other-user',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: 'test-tag',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'current-user',
              'cognito:groups': ['Regular_User'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('権限がありません');
    });

    it('Image_Managerが画像を編集しようとするとエラーを返す', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        tags: [],
        ownerId: 'some-user',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        body: JSON.stringify({
          tagName: 'test-tag',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'manager-user',
              'cognito:groups': ['Image_Manager'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('画像管理者は画像を編集できません');
    });
  });
});
