import * as fc from 'fast-check';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定
process.env.IMAGES_TABLE = 'test-images-table';

import { handler as viewerImagesHandler } from '../viewer-images';

// モック設定
jest.mock('../../common/dynamodb-client', () => ({
  query: jest.fn(),
}));

jest.mock('../../common/logger');

import * as dynamodbClient from '../../common/dynamodb-client';

/**
 * プロパティベーステスト: スライドショー機能サポート（バックエンド）
 * 
 * 設計書の正確性プロパティ38-44を検証
 * 
 * 注意: プロパティ38-44はフロントエンドのUI動作に関するため、
 * バックエンドAPIとしては、スライドショーに必要なデータが
 * 正しく提供されることを検証する
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
    PK: fc.uuid().map(id => `IMAGE#${id}`),
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

describe('Feature: image-management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 8.1**
   * 
   * バックエンド観点: スライドショー開始に必要な画像一覧データが提供される
   */
  describe('Property 38: スライドショー開始サポート', () => {
    it('すべての画像一覧状態について、スライドショーに必要な完全な画像データが返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 3, maxLength: 20 }),
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
            const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: スライドショーに必要な全てのデータが含まれている
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(images.length);

            // 各画像にスライドショーに必要なフィールドが含まれていることを確認
            responseBody.data.images.forEach((image: any) => {
              // 画像表示に必要なフィールド
              expect(image.imageId).toBeDefined();
              expect(image.fileName).toBeDefined();
              expect(image.s3Key).toBeDefined();
              expect(image.thumbnailKeys).toBeDefined();
              expect(image.thumbnailKeys.small).toBeDefined();
              expect(image.thumbnailKeys.medium).toBeDefined();
              expect(image.thumbnailKeys.large).toBeDefined();

              // メタデータ表示に必要なフィールド
              expect(image.capturedAt).toBeDefined();
              expect(image.uploadedAt).toBeDefined();
              expect(image.tags).toBeDefined();
              expect(Array.isArray(image.tags)).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 8.2, 8.5**
   * 
   * バックエンド観点: 画像の順序が正しく保たれている（自動移動・手動操作用）
   */
  describe('Property 39, 41: スライドショー移動サポート', () => {
    it('すべての画像一覧について、撮影日時順で正しくソートされた画像リストが返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 5, maxLength: 20 }),
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
            const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: 画像が正しい順序で返される（前後移動が可能）
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(images.length);

            // 順序が保たれていることを確認
            for (let i = 0; i < responseBody.data.images.length - 1; i++) {
              const currentImage = responseBody.data.images[i];
              const nextImage = responseBody.data.images[i + 1];
              
              const currentDate = new Date(currentImage.capturedAt).getTime();
              const nextDate = new Date(nextImage.capturedAt).getTime();
              
              // 降順であることを確認（新しい順）
              expect(currentDate).toBeGreaterThanOrEqual(nextDate);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 8.6**
   * 
   * バックエンド観点: 画像リストの境界が明確（最初と最後の判定用）
   */
  describe('Property 42: スライドショー終了時動作サポート', () => {
    it('すべての画像一覧について、リストの総数が正しく返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 1, maxLength: 50 }),
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
            const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: 画像の総数が正しく返される（最後の判定用）
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(images.length);

            // 各画像にインデックスを付けられる（0から始まる）
            responseBody.data.images.forEach((image: any, index: number) => {
              expect(image).toBeDefined();
              // 最初の画像: index === 0
              // 最後の画像: index === images.length - 1
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 8.8**
   * 
   * バックエンド観点: 画像位置の計算に必要な情報が提供される
   */
  describe('Property 44: スライドショー位置表示サポート', () => {
    it('すべての画像一覧について、位置計算に必要な情報が含まれている', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 1, maxLength: 30 }),
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
            const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: 位置表示に必要な情報が含まれている
            expect(result.statusCode).toBe(200);
            
            const totalImages = responseBody.data.images.length;
            expect(totalImages).toBe(images.length);

            // 各画像に一意のIDがある（位置の特定用）
            const imageIds = new Set(
              responseBody.data.images.map((img: any) => img.imageId)
            );
            expect(imageIds.size).toBe(totalImages);

            // 配列の順序が保たれている（インデックスベースの位置表示用）
            responseBody.data.images.forEach((image: any, index: number) => {
              expect(image.imageId).toBeDefined();
              // 現在位置: index + 1
              // 総数: totalImages
              // 表示例: "3 / 10"
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 統合テスト: スライドショー全体のデータ整合性
   */
  describe('スライドショー統合サポート', () => {
    it('すべての画像一覧について、スライドショー機能に必要な全てのデータが整合性を持って返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 3, maxLength: 15 }),
          async (images) => {
            // Arrange
            jest.clearAllMocks();

            // 撮影日時でソート
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
            const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: スライドショー機能の全要件を満たすデータが返される
            expect(result.statusCode).toBe(200);
            
            const returnedImages = responseBody.data.images;
            expect(returnedImages.length).toBeGreaterThan(0);

            // 1. 開始可能（画像データが存在）
            expect(returnedImages.length).toBeGreaterThanOrEqual(1);

            // 2. 自動移動可能（順序が保たれている）
            for (let i = 0; i < returnedImages.length - 1; i++) {
              const current = new Date(returnedImages[i].capturedAt).getTime();
              const next = new Date(returnedImages[i + 1].capturedAt).getTime();
              expect(current).toBeGreaterThanOrEqual(next);
            }

            // 3. 手動操作可能（全画像にアクセス可能）
            returnedImages.forEach((image: any) => {
              expect(image.imageId).toBeDefined();
              expect(image.s3Key).toBeDefined();
              expect(image.thumbnailKeys).toBeDefined();
            });

            // 4. 終了判定可能（総数が分かる）
            expect(returnedImages.length).toBe(images.length);

            // 5. 位置表示可能（インデックスと総数）
            const firstImage = returnedImages[0];
            const lastImage = returnedImages[returnedImages.length - 1];
            expect(firstImage).toBeDefined();
            expect(lastImage).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * エッジケース: 画像が1枚の場合
   */
  describe('エッジケース: 単一画像のスライドショー', () => {
    it('画像が1枚の場合でもスライドショーデータが正しく返される', async () => {
      // Arrange
      const singleImage = await fc.sample(imageMetadataArbitrary(), { numRuns: 1 });
      
      (dynamodbClient.query as jest.Mock).mockResolvedValue({
        Items: singleImage,
        LastEvaluatedKey: undefined,
      });

      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '1',
        },
      };

      // Act
      const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      const responseBody = JSON.parse(result.body);
      expect(result.statusCode).toBe(200);
      expect(responseBody.data.images).toHaveLength(1);

      const image = responseBody.data.images[0];
      expect(image.imageId).toBeDefined();
      expect(image.s3Key).toBeDefined();
      expect(image.thumbnailKeys).toBeDefined();
    });
  });

  /**
   * エッジケース: 大量の画像
   */
  describe('エッジケース: 大量画像のスライドショー', () => {
    it('大量の画像でもスライドショーデータが正しく返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(imageMetadataArbitrary(), { minLength: 50, maxLength: 100 }),
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
            const result = await viewerImagesHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(images.length);

            // 全ての画像が必要なフィールドを持っている
            responseBody.data.images.forEach((image: any) => {
              expect(image.imageId).toBeDefined();
              expect(image.s3Key).toBeDefined();
              expect(image.thumbnailKeys).toBeDefined();
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
