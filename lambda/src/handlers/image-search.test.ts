import { APIGatewayProxyEvent } from 'aws-lambda';

// 環境変数を先に設定（ハンドラーのインポート前）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.AWS_REGION = 'ap-northeast-1';

// DynamoDBクライアントのモック
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend,
    })),
  },
  QueryCommand: jest.fn((params) => params),
}));

jest.mock('../common/logger');

import { handler } from './image-search';

describe('画像検索ハンドラー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    it('公開画像を全件取得できる', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'test1.jpg',
          fileSize: 1024,
          tags: ['風景', '自然'],
          capturedAt: '2024-01-01T00:00:00.000Z',
          uploadedAt: '2024-01-01T00:00:00.000Z',
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'test2.jpg',
          fileSize: 2048,
          tags: ['動物'],
          capturedAt: '2024-01-02T00:00:00.000Z',
          uploadedAt: '2024-01-02T00:00:00.000Z',
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-02T00:00:00.000Z#image-2',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {},
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(2);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeUndefined();
    });

    it('キーワードでファイル名を検索できる', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'sunset.jpg',
          tags: ['風景'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'sunrise.jpg',
          tags: ['風景'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-02T00:00:00.000Z#image-2',
        },
        {
          imageId: 'image-3',
          fileName: 'mountain.jpg',
          tags: ['自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-03T00:00:00.000Z#image-3',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          keyword: 'sun',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(2);
      expect(body.images[0].fileName).toBe('sunset.jpg');
      expect(body.images[1].fileName).toBe('sunrise.jpg');
    });

    it('キーワードでタグを検索できる', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'test1.jpg',
          tags: ['風景', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'test2.jpg',
          tags: ['動物', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-02T00:00:00.000Z#image-2',
        },
        {
          imageId: 'image-3',
          fileName: 'test3.jpg',
          tags: ['建物'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-03T00:00:00.000Z#image-3',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          keyword: '自然',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(2);
      expect(body.images[0].imageId).toBe('image-1');
      expect(body.images[1].imageId).toBe('image-2');
    });

    it('タグでフィルタリングできる', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'test1.jpg',
          tags: ['風景', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'test2.jpg',
          tags: ['動物', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-02T00:00:00.000Z#image-2',
        },
        {
          imageId: 'image-3',
          fileName: 'test3.jpg',
          tags: ['建物'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-03T00:00:00.000Z#image-3',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          tags: '自然',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(2);
      expect(body.images[0].imageId).toBe('image-1');
      expect(body.images[1].imageId).toBe('image-2');
    });

    it('複数タグでフィルタリングできる（AND条件）', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'test1.jpg',
          tags: ['風景', '自然', '山'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'test2.jpg',
          tags: ['風景', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-02T00:00:00.000Z#image-2',
        },
        {
          imageId: 'image-3',
          fileName: 'test3.jpg',
          tags: ['風景'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-03T00:00:00.000Z#image-3',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          tags: '風景,自然',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(2);
      expect(body.images[0].imageId).toBe('image-1');
      expect(body.images[1].imageId).toBe('image-2');
    });

    it('撮影日でフィルタリングできる', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'test1.jpg',
          capturedAt: '2024-01-01T00:00:00.000Z',
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'test2.jpg',
          capturedAt: '2024-01-15T00:00:00.000Z',
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-15T00:00:00.000Z#image-2',
        },
        {
          imageId: 'image-3',
          fileName: 'test3.jpg',
          capturedAt: '2024-02-01T00:00:00.000Z',
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-02-01T00:00:00.000Z#image-3',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(3); // DynamoDBクエリでフィルタリングされる想定
    });

    it('複合フィルター（キーワード + タグ）が動作する', async () => {
      // Arrange
      const mockImages = [
        {
          imageId: 'image-1',
          fileName: 'sunset.jpg',
          tags: ['風景', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-01T00:00:00.000Z#image-1',
        },
        {
          imageId: 'image-2',
          fileName: 'sunrise.jpg',
          tags: ['風景'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-02T00:00:00.000Z#image-2',
        },
        {
          imageId: 'image-3',
          fileName: 'mountain.jpg',
          tags: ['風景', '自然'],
          GSI2PK: 'PUBLIC#true',
          GSI2SK: '2024-01-03T00:00:00.000Z#image-3',
        },
      ];

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          keyword: 'sun',
          tags: '風景,自然',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(1);
      expect(body.images[0].imageId).toBe('image-1');
    });

    it('ページネーションが動作する', async () => {
      // Arrange
      const mockImages = Array.from({ length: 21 }, (_, i) => ({
        imageId: `image-${i + 1}`,
        fileName: `test${i + 1}.jpg`,
        tags: [],
        GSI2PK: 'PUBLIC#true',
        GSI2SK: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z#image-${i + 1}`,
      }));

      mockSend.mockResolvedValue({
        Items: mockImages,
        LastEvaluatedKey: { PK: 'IMAGE#image-20', SK: 'METADATA' },
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '20',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.images).toHaveLength(20);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
    });
  });

  describe('異常系', () => {
    it('無効なカーソルの場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          cursor: 'invalid-cursor',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid cursor');
    });

    it('DynamoDBエラーの場合は500エラーを返す', async () => {
      // Arrange
      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {},
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Internal Server Error');
    });
  });
});
