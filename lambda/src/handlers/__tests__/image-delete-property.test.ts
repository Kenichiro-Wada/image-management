import * as fc from 'fast-check';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数の設定（ハンドラーインポート前に設定）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.IMAGES_BUCKET = 'test-images-bucket';
process.env.THUMBNAILS_BUCKET = 'test-thumbnails-bucket';

// モックの設定（ハンドラーインポート前に設定）
jest.mock('../../common/dynamodb-client', () => ({
  get: jest.fn(),
  deleteItem: jest.fn(),
}));

jest.mock('../../common/s3-client', () => ({
  deleteObject: jest.fn(),
}));

jest.mock('../../common/logger');

import { handler as deleteHandler } from '../image-delete';
import { handler as bulkDeleteHandler } from '../image-bulk-delete';
import * as dynamodbClient from '../../common/dynamodb-client';
import * as s3Client from '../../common/s3-client';

const mockGet = dynamodbClient.get as jest.MockedFunction<typeof dynamodbClient.get>;
const mockDeleteItem = dynamodbClient.deleteItem as jest.MockedFunction<typeof dynamodbClient.deleteItem>;
const mockDeleteObject = s3Client.deleteObject as jest.MockedFunction<typeof s3Client.deleteObject>;

// テスト用のArbitrary定義
const imageIdArbitrary = () => fc.uuid();

const imageMetadataArbitrary = () =>
  fc.record({
    PK: fc.string().map((id) => `IMAGE#${id}`),
    SK: fc.constant('METADATA'),
    imageId: fc.uuid(),
    fileName: fc.string({ minLength: 1, maxLength: 50 }).map((s) => `${s.trim() || 'image'}.jpg`),
    fileSize: fc.integer({ min: 1000, max: 10000000 }),
    mimeType: fc.constant('image/jpeg'),
    width: fc.integer({ min: 100, max: 4000 }),
    height: fc.integer({ min: 100, max: 4000 }),
    uploadedAt: fc.integer({ min: 1577836800000, max: 1735689600000 }).map((timestamp) => new Date(timestamp).toISOString()),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ''), {
      maxLength: 10,
    }),
    isPublic: fc.boolean(),
    ownerId: fc.uuid(),
    ownerName: fc.string({ minLength: 1, maxLength: 50 }),
    s3Key: fc.string({ minLength: 1, maxLength: 100 }).map((s) => `images/${s.trim() || 'key'}.jpg`),
    thumbnailKeys: fc.record({
      small: fc.string().map((s) => `thumbnails/small/${s || 'key'}.jpg`),
      medium: fc.string().map((s) => `thumbnails/medium/${s || 'key'}.jpg`),
      large: fc.string().map((s) => `thumbnails/large/${s || 'key'}.jpg`),
    }),
  });

const userRoleArbitrary = () =>
  fc.constantFrom('SYSTEM_ADMIN', 'IMAGE_MANAGER', 'REGULAR_USER');

// テストヘルパー関数
const createMockEvent = (
  imageId: string,
  userId: string,
  role: string
): APIGatewayProxyEvent => ({
  pathParameters: { id: imageId },
  requestContext: {
    authorizer: {
      claims: {
        sub: userId,
        'cognito:groups': [role],
      },
    },
  } as any,
} as any);

const createBulkDeleteMockEvent = (
  imageIds: string[],
  userId: string,
  role: string
): APIGatewayProxyEvent => ({
  body: JSON.stringify({ imageIds }),
  requestContext: {
    authorizer: {
      claims: {
        sub: userId,
        'cognito:groups': [role],
      },
    },
  } as any,
} as any);

const mockContext: Context = {
  awsRequestId: 'test-request-id',
} as any;

describe('Feature: image-management, Property 26: 画像削除完全性', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('すべての画像について、削除処理を実行すると、画像がS3ストレージから削除され、関連するメタデータとタグもDynamoDBから削除される', async () => {
    await fc.assert(
      fc.asyncProperty(
        imageMetadataArbitrary(),
        async (imageMetadata) => {
          // Arrange
          mockGet.mockResolvedValue(imageMetadata);
          mockDeleteObject.mockResolvedValue(undefined);
          mockDeleteItem.mockResolvedValue(undefined);

          const event = createMockEvent(
            imageMetadata.imageId,
            imageMetadata.ownerId,
            'SYSTEM_ADMIN'
          );

          // Act
          const result = await deleteHandler(event, mockContext);

          // Assert
          expect(result.statusCode).toBe(200);

          // S3から元画像が削除されたことを確認
          expect(mockDeleteObject).toHaveBeenCalledWith({
            bucket: 'test-images-bucket',
            key: imageMetadata.s3Key,
          });

          // S3からサムネイルが削除されたことを確認
          expect(mockDeleteObject).toHaveBeenCalledWith({
            bucket: 'test-thumbnails-bucket',
            key: imageMetadata.thumbnailKeys.small,
          });
          expect(mockDeleteObject).toHaveBeenCalledWith({
            bucket: 'test-thumbnails-bucket',
            key: imageMetadata.thumbnailKeys.medium,
          });
          expect(mockDeleteObject).toHaveBeenCalledWith({
            bucket: 'test-thumbnails-bucket',
            key: imageMetadata.thumbnailKeys.large,
          });

          // DynamoDBからメタデータが削除されたことを確認
          expect(mockDeleteItem).toHaveBeenCalledWith({
            tableName: 'test-images-table',
            key: {
              PK: `IMAGE#${imageMetadata.imageId}`,
              SK: 'METADATA',
            },
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: image-management, Property 27: 削除エラー時状態維持', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('すべての削除エラー状況について、削除処理でエラーが発生すると、元の状態が維持される', async () => {
    await fc.assert(
      fc.asyncProperty(
        imageMetadataArbitrary(),
        async (imageMetadata) => {
          // Arrange
          mockGet.mockResolvedValue(imageMetadata);
          // S3削除でエラーを発生させる
          mockDeleteObject.mockRejectedValue(new Error('S3削除エラー'));

          const event = createMockEvent(
            imageMetadata.imageId,
            imageMetadata.ownerId,
            'SYSTEM_ADMIN'
          );

          // Act
          const result = await deleteHandler(event, mockContext);

          // Assert
          // エラーハンドラーが500エラーを返すことを確認
          expect(result.statusCode).toBe(500);

          // DynamoDBからメタデータが削除されていないことを確認
          expect(mockDeleteItem).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
