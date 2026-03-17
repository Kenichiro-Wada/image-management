import * as fc from 'fast-check';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定
process.env.IMAGES_TABLE = 'test-images-table';

import { handler } from '../viewer-images';

// モック設定
jest.mock('../../common/dynamodb-client', () => ({
  query: jest.fn(),
}));

jest.mock('../../common/logger');

import * as dynamodbClient from '../../common/dynamodb-client';

/**
 * プロパティベーステスト: 画像表示機能（ビューアー）
 * 
 * 設計書の正確性プロパティ11-14を検証
 * 
 * 注意: プロパティ12-14はフロントエンドのUI動作に関するため、
 * バックエンドAPIとしてはプロパティ11（無限スクロール）と
 * 画像詳細情報の正確性を検証する
 */

// テスト用のContext
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

// Arbitraries（テストデータジェネレーター）

// 画像メタデータを生成
const imageMetadataArbitrary = () =>
  fc.record({
    PK: fc.string().map(s => `IMAGE#${s}`),
    SK: fc.constant('METADATA'),
    imageId: fc.uuid(),
    fileName: fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}\.(jpg|jpeg)$/),
    fileSize: fc.integer({ min: 1000, max: 10000000 }),
    mimeType: fc.constantFrom('image/jpeg', 'image/jpg'),
    width: fc.integer({ min: 100, max: 4000 }),
    height: fc.integer({ min: 100, max: 4000 }),
    uploadedAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2025-12-31') }).map(ts => new Date(ts).toISOString()),
    capturedAt: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2025-12-31') }).map(ts => new Date(ts).toISOString()),
    tags: fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/), { maxLength: 10 }),
    isPublic: fc.constant(true),
    ownerId: fc.uuid(),
    ownerName: fc.string({ minLength: 3, maxLength: 30 }),
    s3Key: fc.string().map(s => `images/${s}.jpg`),
    thumbnailKeys: fc.record({
      small: fc.string().map(s => `thumbnails/small/${s}.jpg`),
      medium: fc.string().map(s => `thumbnails/medium/${s}.jpg`),
      large: fc.string().map(s => `thumbnails/large/${s}.jpg`),
    }),
    GSI2PK: fc.constant('PUBLIC#true'),
    GSI2SK: fc.tuple(
      fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2025-12-31') }),
      fc.uuid()
    ).map(([ts, id]) => `${new Date(ts).toISOString()}#${id}`),
  });

// ページサイズを生成
const pageSizeArbitrary = () => fc.integer({ min: 1, max: 100 });

// カーソルを生成
const cursorArbitrary = (lastKey: any) =>
  Buffer.from(JSON.stringify(lastKey)).toString('base64');

describe('Feature: image-management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 3.2**
   */
  describe('Property 11: 無限スクロール読み込み', () => {
    it('すべてのスクロール位置について、次のページ読み込み処理を実行すると、指定件数の次の画像が正しく読み込まれる', async () => {
      await fc.assert(
        fc.asyncProperty(
          pageSizeArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 1, maxLength: 50 }),
          async (limit, allImages) => {
            // Arrange
            jest.clearAllMocks();

            // 最初のページ
            const firstPageImages = allImages.slice(0, limit);
            const hasMore = allImages.length > limit;
            const lastEvaluatedKey = hasMore ? {
              PK: firstPageImages[firstPageImages.length - 1].PK,
              SK: firstPageImages[firstPageImages.length - 1].SK,
              GSI2PK: firstPageImages[firstPageImages.length - 1].GSI2PK,
              GSI2SK: firstPageImages[firstPageImages.length - 1].GSI2SK,
            } : undefined;

            (dynamodbClient.query as jest.Mock).mockResolvedValue({
              Items: firstPageImages,
              LastEvaluatedKey: lastEvaluatedKey,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                limit: String(limit),
              },
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: 指定件数の画像が正しく読み込まれる
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(Math.min(limit, allImages.length));
            expect(responseBody.data.pagination.limit).toBe(limit);
            expect(responseBody.data.pagination.hasMore).toBe(hasMore);

            // 次のページがある場合、カーソルが返される
            if (hasMore) {
              expect(responseBody.data.pagination.cursor).toBeDefined();
            } else {
              expect(responseBody.data.pagination.cursor).toBeUndefined();
            }

            // DynamoDBクエリが正しいパラメータで呼ばれる
            expect(dynamodbClient.query).toHaveBeenCalledWith(
              expect.objectContaining({
                tableName: 'test-images-table',
                indexName: 'GSI2',
                keyConditionExpression: '#GSI2PK = :gsi2pk',
                expressionAttributeValues: {
                  ':gsi2pk': 'PUBLIC#true',
                },
                limit,
                scanIndexForward: false, // 降順
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('カーソルを使用して次のページを正しく読み込める', async () => {
      await fc.assert(
        fc.asyncProperty(
          pageSizeArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 10, maxLength: 50 }),
          async (limit, allImages) => {
            // Arrange
            jest.clearAllMocks();

            // 最初のページ
            const firstPageImages = allImages.slice(0, limit);
            const lastKey = {
              PK: firstPageImages[firstPageImages.length - 1].PK,
              SK: firstPageImages[firstPageImages.length - 1].SK,
              GSI2PK: firstPageImages[firstPageImages.length - 1].GSI2PK,
              GSI2SK: firstPageImages[firstPageImages.length - 1].GSI2SK,
            };
            const cursor = cursorArbitrary(lastKey);

            // 2ページ目
            const secondPageImages = allImages.slice(limit, limit * 2);
            const hasMoreAfterSecondPage = allImages.length > limit * 2;

            (dynamodbClient.query as jest.Mock).mockResolvedValue({
              Items: secondPageImages,
              LastEvaluatedKey: hasMoreAfterSecondPage ? {
                PK: secondPageImages[secondPageImages.length - 1]?.PK,
                SK: secondPageImages[secondPageImages.length - 1]?.SK,
                GSI2PK: secondPageImages[secondPageImages.length - 1]?.GSI2PK,
                GSI2SK: secondPageImages[secondPageImages.length - 1]?.GSI2SK,
              } : undefined,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                limit: String(limit),
                cursor,
              },
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: カーソルを使用して次のページが正しく読み込まれる
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(secondPageImages.length);

            // DynamoDBクエリにexclusiveStartKeyが渡される
            expect(dynamodbClient.query).toHaveBeenCalledWith(
              expect.objectContaining({
                exclusiveStartKey: lastKey,
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 3.3, 3.4**
   * 
   * 注意: プロパティ12（サムネイルクリック拡大表示）と
   * プロパティ13（拡大表示詳細情報）はフロントエンドのUI動作。
   * バックエンドAPIとしては、画像詳細情報が正しく返されることを検証。
   */
  describe('Property 12-13: 画像詳細情報の正確性', () => {
    it('すべての画像について、詳細情報（ファイル名、撮影日時、タグ等）が正しく返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 1, maxLength: 20 }),
          async (images) => {
            // Arrange
            jest.clearAllMocks();
            (dynamodbClient.query as jest.Mock).mockResolvedValue({
              Items: images,
              LastEvaluatedKey: undefined,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                limit: String(images.length),
              },
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: すべての画像の詳細情報が正しく返される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(images.length);

            // 各画像の詳細情報を検証
            responseBody.data.images.forEach((returnedImage: any, index: number) => {
              const originalImage = images[index];
              
              // 必須フィールドが含まれている
              expect(returnedImage.imageId).toBe(originalImage.imageId);
              expect(returnedImage.fileName).toBe(originalImage.fileName);
              expect(returnedImage.fileSize).toBe(originalImage.fileSize);
              expect(returnedImage.mimeType).toBe(originalImage.mimeType);
              expect(returnedImage.width).toBe(originalImage.width);
              expect(returnedImage.height).toBe(originalImage.height);
              expect(returnedImage.uploadedAt).toBe(originalImage.uploadedAt);
              expect(returnedImage.capturedAt).toBe(originalImage.capturedAt);
              expect(returnedImage.tags).toEqual(originalImage.tags);
              expect(returnedImage.ownerName).toBe(originalImage.ownerName);
              expect(returnedImage.s3Key).toBe(originalImage.s3Key);
              expect(returnedImage.thumbnailKeys).toEqual(originalImage.thumbnailKeys);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 3.5**
   * 
   * 注意: プロパティ14（拡大表示ナビゲーション）はフロントエンドのUI動作。
   * バックエンドAPIとしては、画像一覧が正しい順序で返されることを検証。
   */
  describe('Property 14: 画像順序の正確性（ナビゲーション用）', () => {
    it('すべての画像一覧について、撮影日時の降順で正しくソートされて返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 2, maxLength: 20 }),
          async (images) => {
            // Arrange
            jest.clearAllMocks();

            // 撮影日時でソート（降順）
            const sortedImages = [...images].sort((a, b) => 
              new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
            );

            (dynamodbClient.query as jest.Mock).mockResolvedValue({
              Items: sortedImages,
              LastEvaluatedKey: undefined,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                limit: String(images.length),
              },
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: 画像が撮影日時の降順で返される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(images.length);

            // 順序が正しいことを検証（前後の画像に移動できる）
            for (let i = 0; i < responseBody.data.images.length - 1; i++) {
              const currentImage = responseBody.data.images[i];
              const nextImage = responseBody.data.images[i + 1];
              
              const currentDate = new Date(currentImage.capturedAt).getTime();
              const nextDate = new Date(nextImage.capturedAt).getTime();
              
              // 降順であることを確認
              expect(currentDate).toBeGreaterThanOrEqual(nextDate);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('エッジケース', () => {
    it('画像が0件の場合でも正しく処理される', async () => {
      // Arrange
      (dynamodbClient.query as jest.Mock).mockResolvedValue({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '20',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      const responseBody = JSON.parse(result.body);
      expect(result.statusCode).toBe(200);
      expect(responseBody.data.images).toHaveLength(0);
      expect(responseBody.data.pagination.hasMore).toBe(false);
      expect(responseBody.data.pagination.cursor).toBeUndefined();
    });

    it('limitが範囲外の場合はエラーを返す', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ max: 0 }),
            fc.integer({ min: 101 })
          ),
          async (invalidLimit) => {
            // Arrange
            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                limit: String(invalidLimit),
              },
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            expect(result.statusCode).toBe(400);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error.message).toContain('limitは1〜100の範囲で指定してください');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('無効なカーソルの場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '20',
          cursor: 'invalid-cursor',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error.message).toContain('無効なカーソルです');
    });
  });
});
