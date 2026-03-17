import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定（ハンドラーのインポート前）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.IMAGES_BUCKET = 'test-images-bucket';
process.env.THUMBNAILS_BUCKET = 'test-thumbnails-bucket';

import { handler } from './image-delete';

// モック設定
jest.mock('../common/dynamodb-client', () => ({
  get: jest.fn(),
  deleteItem: jest.fn(),
}));

jest.mock('../common/s3-client', () => ({
  deleteObject: jest.fn(),
}));

jest.mock('../common/logger');

import * as dynamodbClient from '../common/dynamodb-client';
import * as s3Client from '../common/s3-client';

describe('画像削除ハンドラー', () => {
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
    it('System_Adminが画像を削除できる', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        fileName: 'test.jpg',
        ownerId: 'other-user',
        s3Key: 'images/test.jpg',
        thumbnailKeys: {
          small: 'thumbnails/small/test.jpg',
          medium: 'thumbnails/medium/test.jpg',
          large: 'thumbnails/large/test.jpg',
        },
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);
      (s3Client.deleteObject as jest.Mock).mockResolvedValue({});
      (dynamodbClient.deleteItem as jest.Mock).mockResolvedValue({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'admin-user',
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
      expect(body.data.message).toContain('画像を削除しました');
      expect(body.data.imageId).toBe('test-image-id');

      // S3から元画像を削除
      expect(s3Client.deleteObject).toHaveBeenCalledWith({
        bucket: 'test-images-bucket',
        key: 'images/test.jpg',
      });

      // S3からサムネイルを削除
      expect(s3Client.deleteObject).toHaveBeenCalledWith({
        bucket: 'test-thumbnails-bucket',
        key: 'thumbnails/small/test.jpg',
      });
      expect(s3Client.deleteObject).toHaveBeenCalledWith({
        bucket: 'test-thumbnails-bucket',
        key: 'thumbnails/medium/test.jpg',
      });
      expect(s3Client.deleteObject).toHaveBeenCalledWith({
        bucket: 'test-thumbnails-bucket',
        key: 'thumbnails/large/test.jpg',
      });

      // DynamoDBからメタデータを削除
      expect(dynamodbClient.deleteItem).toHaveBeenCalledWith({
        tableName: 'test-images-table',
        key: {
          PK: 'IMAGE#test-image-id',
          SK: 'METADATA',
        },
      });
    });

    it('Regular_Userが自分の画像を削除できる', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        fileName: 'test.jpg',
        ownerId: 'current-user',
        s3Key: 'images/test.jpg',
        thumbnailKeys: {
          small: 'thumbnails/small/test.jpg',
          medium: 'thumbnails/medium/test.jpg',
          large: 'thumbnails/large/test.jpg',
        },
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);
      (s3Client.deleteObject as jest.Mock).mockResolvedValue({});
      (dynamodbClient.deleteItem as jest.Mock).mockResolvedValue({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.message).toContain('画像を削除しました');
    });

    it('サムネイルがない画像も削除できる', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        fileName: 'test.jpg',
        ownerId: 'current-user',
        s3Key: 'images/test.jpg',
        // thumbnailKeysなし
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);
      (s3Client.deleteObject as jest.Mock).mockResolvedValue({});
      (dynamodbClient.deleteItem as jest.Mock).mockResolvedValue({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'current-user',
              'cognito:groups': ['System_Admin'],
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      
      // 元画像のみ削除される
      expect(s3Client.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Client.deleteObject).toHaveBeenCalledWith({
        bucket: 'test-images-bucket',
        key: 'images/test.jpg',
      });
    });
  });

  describe('異常系', () => {
    it('画像IDが指定されていない場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: null,
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.message).toContain('画像IDが指定されていません');
    });

    it('画像が見つからない場合はエラーを返す', async () => {
      // Arrange
      (dynamodbClient.get as jest.Mock).mockResolvedValue(null);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'non-existent-id',
        },
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

    it('Regular_Userが他人の画像を削除しようとするとエラーを返す', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        fileName: 'test.jpg',
        ownerId: 'other-user',
        s3Key: 'images/test.jpg',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
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

    it('Image_Managerが画像を削除しようとするとエラーを返す', async () => {
      // Arrange
      const mockImageMetadata = {
        PK: 'IMAGE#test-image-id',
        SK: 'METADATA',
        imageId: 'test-image-id',
        fileName: 'test.jpg',
        ownerId: 'some-user',
        s3Key: 'images/test.jpg',
      };

      (dynamodbClient.get as jest.Mock).mockResolvedValue(mockImageMetadata);

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'test-image-id',
        },
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
      expect(body.error.message).toContain('画像管理者は画像を削除できません');
    });
  });
});
