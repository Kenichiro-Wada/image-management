import * as fc from 'fast-check';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数の設定（ハンドラーインポート前に設定）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.IMAGES_BUCKET = 'test-images-bucket';

// モックの設定（ハンドラーインポート前に設定）
jest.mock('../../common/dynamodb-client', () => ({
  get: jest.fn(),
}));

jest.mock('../../common/s3-client', () => ({
  getObject: jest.fn(),
  s3: {
    getSignedDownloadUrl: jest.fn(),
  },
}));

jest.mock('../../common/logger');

import { handler as downloadHandler } from '../image-download';
import { handler as bulkDownloadHandler } from '../image-bulk-download';
import * as dynamodbClient from '../../common/dynamodb-client';
import * as s3Client from '../../common/s3-client';

const mockGet = dynamodbClient.get as jest.MockedFunction<typeof dynamodbClient.get>;
const mockGetObject = s3Client.getObject as jest.MockedFunction<typeof s3Client.getObject>;
const mockGetSignedDownloadUrl = s3Client.s3.getSignedDownloadUrl as jest.MockedFunction<any>;

// テスト用のArbitrary定義
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

const createBulkDownloadMockEvent = (
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

describe('Feature: image-management, Property 29: 画像ダウンロード権限', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('すべてのSystem_AdminまたはImage_Managerについて、任意の画像のダウンロード処理を実行すると、オリジナル画像がダウンロードされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        imageMetadataArbitrary(),
        fc.constantFrom('SYSTEM_ADMIN', 'IMAGE_MANAGER'),
        fc.uuid(), // 異なるユーザーID
        async (imageMetadata, role, differentUserId) => {
          // Arrange
          mockGet.mockResolvedValue(imageMetadata);
          mockGetSignedDownloadUrl.mockResolvedValue('https://example.com/download-url');

          const event = createMockEvent(imageMetadata.imageId, differentUserId, role);

          // Act
          const result = await downloadHandler(event, mockContext);

          // Assert
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.downloadUrl).toBe('https://example.com/download-url');
          expect(body.fileName).toBe(imageMetadata.fileName);
          expect(body.fileSize).toBe(imageMetadata.fileSize);
          expect(body.mimeType).toBe(imageMetadata.mimeType);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: image-management, Property 30: 自分の画像ダウンロード', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('すべてのRegular_Userについて、自分の画像のダウンロード処理を実行すると、オリジナル画像がダウンロードされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        imageMetadataArbitrary(),
        async (imageMetadata) => {
          // Arrange
          mockGet.mockResolvedValue(imageMetadata);
          mockGetSignedDownloadUrl.mockResolvedValue('https://example.com/download-url');

          // 自分の画像をダウンロード
          const event = createMockEvent(
            imageMetadata.imageId,
            imageMetadata.ownerId,
            'Regular_User'
          );

          // Act
          const result = await downloadHandler(event, mockContext);

          // Assert
          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.downloadUrl).toBe('https://example.com/download-url');
          expect(body.fileName).toBe(imageMetadata.fileName);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: image-management, Property 31: ダウンロードアクセス制御', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('すべてのRegular_Userについて、他のユーザーの画像をダウンロードしようとすると、操作が拒否される', async () => {
    await fc.assert(
      fc.asyncProperty(
        imageMetadataArbitrary(),
        fc.uuid(), // 異なるユーザーID
        async (imageMetadata, differentUserId) => {
          // 異なるユーザーIDであることを確認（前提条件）
          if (imageMetadata.ownerId === differentUserId) {
            // 同じユーザーIDの場合はスキップ
            return true;
          }

          // Arrange
          mockGet.mockResolvedValue(imageMetadata);

          const event = createMockEvent(
            imageMetadata.imageId,
            differentUserId,
            'Regular_User'
          );

          // Act
          const result = await downloadHandler(event, mockContext);

          // Assert
          expect(result.statusCode).toBe(403);
          const body = JSON.parse(result.body);
          expect(body.error.message).toContain('権限がありません');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: image-management, Property 32: 一括ダウンロード', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('すべてのチェックされた画像の組み合わせについて、一括ダウンロード処理を実行すると、すべての画像がZIPファイルにまとめられてダウンロードされる', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(imageMetadataArbitrary(), { minLength: 1, maxLength: 10 }),
        async (imageMetadataList) => {
          // Arrange
          jest.clearAllMocks(); // 各テストケースの前にモックをクリア
          
          const imageIds = imageMetadataList.map((m) => m.imageId);
          const ownerId = imageMetadataList[0].ownerId;

          // すべての画像を同じユーザーが所有していると仮定
          const normalizedMetadataList = imageMetadataList.map((m) => ({
            ...m,
            ownerId,
          }));

          mockGet.mockImplementation(async ({ key }: any) => {
            const imageId = key.PK.replace('IMAGE#', '');
            return normalizedMetadataList.find((m) => m.imageId === imageId);
          });

          mockGetObject.mockImplementation(async ({ key }: any) => ({
            Body: Buffer.from('fake-image-data'),
            ContentType: 'image/jpeg',
            ContentLength: 15,
            Metadata: {},
          }));

          const event = createBulkDownloadMockEvent(imageIds, ownerId, 'SYSTEM_ADMIN');

          // Act
          const result = await bulkDownloadHandler(event, mockContext);

          // Assert
          expect(result.statusCode).toBe(200);
          expect(result.headers?.['Content-Type']).toBe('application/zip');
          expect(result.headers?.['Content-Disposition']).toContain('attachment');
          expect(result.isBase64Encoded).toBe(true);

          // すべての画像がS3から取得されたことを確認
          expect(mockGetObject).toHaveBeenCalledTimes(imageIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
