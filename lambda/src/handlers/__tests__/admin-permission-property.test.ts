import * as fc from 'fast-check';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定
process.env.IMAGES_TABLE = 'test-images-table';
process.env.IMAGES_BUCKET = 'test-images-bucket';
process.env.THUMBNAILS_BUCKET = 'test-thumbnails-bucket';

import { handler as imageListHandler } from '../image-list';
import { handler as imageVisibilityHandler } from '../image-visibility';
import { handler as imageBulkDeleteHandler } from '../image-bulk-delete';

// モック設定
jest.mock('../../common/dynamodb-client', () => ({
  query: jest.fn(),
  scan: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  deleteItem: jest.fn(),
}));

jest.mock('../../common/s3-client', () => ({
  deleteObject: jest.fn(),
}));

jest.mock('../../common/logger');

import * as dynamodbClient from '../../common/dynamodb-client';
import * as s3Client from '../../common/s3-client';

/**
 * プロパティベーステスト: 権限・管理機能
 * 
 * 設計書の正確性プロパティ15-25を検証
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

// ユーザーロールを生成
const userRoleArbitrary = () =>
  fc.constantFrom('System_Admin', 'Image_Manager', 'Regular_User');

// ユーザーIDを生成
const userIdArbitrary = () => fc.uuid();

// 画像メタデータを生成
const imageMetadataArbitrary = (ownerId?: string) =>
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
    isPublic: fc.boolean(),
    ownerId: ownerId ? fc.constant(ownerId) : fc.uuid(),
    ownerName: fc.string({ minLength: 3, maxLength: 30 }),
    s3Key: fc.string().map(s => `images/${s}.jpg`),
    thumbnailKeys: fc.record({
      small: fc.string().map(s => `thumbnails/small/${s}.jpg`),
      medium: fc.string().map(s => `thumbnails/medium/${s}.jpg`),
      large: fc.string().map(s => `thumbnails/large/${s}.jpg`),
    }),
    GSI1PK: ownerId ? fc.constant(`USER#${ownerId}`) : fc.uuid().map(id => `USER#${id}`),
    GSI1SK: fc.integer({ min: Date.parse('2020-01-01'), max: Date.parse('2025-12-31') }).map(ts => new Date(ts).toISOString()),
  });

describe('Feature: image-management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 4.1**
   */
  describe('Property 15: ユーザー権限別画像表示', () => {
    it('すべてのRegular_Userについて、管理画面アクセス処理を実行すると、自分がアップロードした画像のみが表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 5, maxLength: 20 }),
          async (userId, otherImages) => {
            // Arrange
            jest.clearAllMocks();

            // ユーザー自身の画像を生成
            const userImages = await fc.sample(
              imageMetadataArbitrary(userId),
              { numRuns: 3 }
            );

            // GSI1クエリの結果をモック（ユーザー自身の画像のみ）
            (dynamodbClient.query as jest.Mock).mockResolvedValue({
              Items: userImages,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                page: '1',
              },
              requestContext: {
                authorizer: {
                  claims: {
                    sub: userId,
                    'cognito:groups': ['Regular_User'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageListHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: Regular_Userは自分の画像のみ表示される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images).toHaveLength(userImages.length);

            // 全ての画像が自分のものであることを確認
            responseBody.data.images.forEach((image: any) => {
              expect(image.ownerId).toBe(userId);
            });

            // GSI1が正しく使用されていることを確認
            expect(dynamodbClient.query).toHaveBeenCalledWith(
              expect.objectContaining({
                indexName: 'GSI1',
                expressionAttributeValues: {
                  ':gsi1pk': `USER#${userId}`,
                },
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.2**
   */
  describe('Property 16: システム管理者全画像表示', () => {
    it('すべてのSystem_Adminについて、管理画面アクセス処理を実行すると、すべてのユーザーの画像が表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 5, maxLength: 20 }),
          async (adminUserId, allImages) => {
            // Arrange
            jest.clearAllMocks();

            // スキャンの結果をモック（全画像）
            (dynamodbClient.scan as jest.Mock).mockResolvedValue({
              Items: allImages,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                page: '1',
              },
              requestContext: {
                authorizer: {
                  claims: {
                    sub: adminUserId,
                    'cognito:groups': ['System_Admin'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageListHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: System_Adminは全ての画像が表示される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images.length).toBeGreaterThan(0);

            // スキャンが使用されていることを確認
            expect(dynamodbClient.scan).toHaveBeenCalledWith(
              expect.objectContaining({
                tableName: 'test-images-table',
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.3**
   */
  describe('Property 17: 画像管理者全画像表示', () => {
    it('すべてのImage_Managerについて、管理画面アクセス処理を実行すると、すべてのユーザーの画像が表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 5, maxLength: 20 }),
          async (managerUserId, allImages) => {
            // Arrange
            jest.clearAllMocks();

            // スキャンの結果をモック（全画像）
            (dynamodbClient.scan as jest.Mock).mockResolvedValue({
              Items: allImages,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                page: '1',
              },
              requestContext: {
                authorizer: {
                  claims: {
                    sub: managerUserId,
                    'cognito:groups': ['Image_Manager'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageListHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: Image_Managerは全ての画像が表示される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.images.length).toBeGreaterThan(0);

            // スキャンが使用されていることを確認
            expect(dynamodbClient.scan).toHaveBeenCalledWith(
              expect.objectContaining({
                tableName: 'test-images-table',
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.4**
   */
  describe('Property 18: ページネーション正確性', () => {
    it('すべてのページ番号について、ページネーション処理を実行すると、指定されたページの正しい画像（50件）が表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.array(imageMetadataArbitrary(), { minLength: 100, maxLength: 200 }),
          async (page, allImages) => {
            // Arrange
            jest.clearAllMocks();

            (dynamodbClient.scan as jest.Mock).mockResolvedValue({
              Items: allImages,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                page: String(page),
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
            const result = await imageListHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: ページネーションが正しく動作する
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.pagination.currentPage).toBe(page);
            expect(responseBody.data.pagination.pageSize).toBe(50);

            // ページ内の画像数を確認（最後のページ以外は50件）
            const totalPages = responseBody.data.pagination.totalPages;
            if (page < totalPages) {
              expect(responseBody.data.images).toHaveLength(50);
            } else {
              expect(responseBody.data.images.length).toBeLessThanOrEqual(50);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.6, 4.7**
   */
  describe('Property 19: 公開状態変更権限', () => {
    it('すべてのSystem_AdminまたはImage_Managerについて、任意の画像の公開状態変更処理を実行すると、正しく更新される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('System_Admin', 'Image_Manager'),
          userIdArbitrary(),
          imageMetadataArbitrary(),
          fc.boolean(),
          async (userRole, userId, imageMetadata, newIsPublic) => {
            // Arrange
            jest.clearAllMocks();

            // 現在の公開状態と異なる値を設定
            const currentIsPublic = !newIsPublic;
            const imageWithCurrentState = { ...imageMetadata, isPublic: currentIsPublic };

            (dynamodbClient.get as jest.Mock).mockResolvedValue(imageWithCurrentState);
            (dynamodbClient.update as jest.Mock).mockResolvedValue({});

            const event: Partial<APIGatewayProxyEvent> = {
              pathParameters: {
                id: imageMetadata.imageId,
              },
              body: JSON.stringify({
                isPublic: newIsPublic,
              }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: userId,
                    'cognito:groups': [userRole],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageVisibilityHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: System_AdminとImage_Managerは公開状態を変更できる
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.isPublic).toBe(newIsPublic);

            // DynamoDBの更新が呼ばれたことを確認
            expect(dynamodbClient.update).toHaveBeenCalledWith(
              expect.objectContaining({
                expressionAttributeValues: expect.objectContaining({
                  ':isPublic': newIsPublic,
                }),
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Regular_Userは公開状態を変更できない', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          imageMetadataArbitrary(),
          fc.boolean(),
          async (userId, imageMetadata, newIsPublic) => {
            // Arrange
            jest.clearAllMocks();

            const event: Partial<APIGatewayProxyEvent> = {
              pathParameters: {
                id: imageMetadata.imageId,
              },
              body: JSON.stringify({
                isPublic: newIsPublic,
              }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: userId,
                    'cognito:groups': ['Regular_User'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageVisibilityHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            // プロパティ: Regular_Userは公開状態を変更できない
            expect(result.statusCode).toBe(403);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error.message).toContain('権限がありません');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.12**
   */
  describe('Property 22: 一括削除実行', () => {
    it('すべてのチェックされた画像の組み合わせについて、一括削除処理を実行すると、チェックされたすべての画像が削除される', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 2, maxLength: 10 }),
          async (userId, images) => {
            // Arrange
            jest.clearAllMocks();

            // ユーザー自身の画像として設定
            const userImages = images.map(img => ({ ...img, ownerId: userId }));
            const imageIds = userImages.map(img => img.imageId);

            // 各画像のgetをモック
            userImages.forEach(img => {
              (dynamodbClient.get as jest.Mock).mockResolvedValueOnce(img);
            });

            (dynamodbClient.deleteItem as jest.Mock).mockResolvedValue({});
            (s3Client.deleteObject as jest.Mock).mockResolvedValue({});

            const event: Partial<APIGatewayProxyEvent> = {
              body: JSON.stringify({
                imageIds,
              }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: userId,
                    'cognito:groups': ['Regular_User'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageBulkDeleteHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: チェックされた全ての画像が削除される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.results.success).toHaveLength(imageIds.length);
            expect(responseBody.data.results.failed).toHaveLength(0);

            // 各画像に対してdeleteItemが呼ばれたことを確認
            expect(dynamodbClient.deleteItem).toHaveBeenCalledTimes(imageIds.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.13, 5.8**
   */
  describe('Property 23: アクセス制御', () => {
    it('すべてのRegular_Userについて、他のユーザーの画像に対する削除を実行しようとすると、操作が拒否される', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          userIdArbitrary(),
          imageMetadataArbitrary(),
          async (userId, otherUserId, imageMetadata) => {
            // 異なるユーザーIDであることを確保
            fc.pre(userId !== otherUserId);

            // Arrange
            jest.clearAllMocks();

            // 他のユーザーの画像として設定
            const otherUserImage = { ...imageMetadata, ownerId: otherUserId };

            (dynamodbClient.get as jest.Mock).mockResolvedValue(otherUserImage);

            const event: Partial<APIGatewayProxyEvent> = {
              body: JSON.stringify({
                imageIds: [imageMetadata.imageId],
              }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: userId,
                    'cognito:groups': ['Regular_User'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageBulkDeleteHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: 他のユーザーの画像は削除できない
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.results.success).toHaveLength(0);
            expect(responseBody.data.results.failed).toHaveLength(1);
            expect(responseBody.data.results.failed[0].reason).toContain('権限がありません');

            // deleteItemが呼ばれていないことを確認
            expect(dynamodbClient.deleteItem).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.14, 5.9**
   */
  describe('Property 24: 画像管理者操作制限', () => {
    it('すべてのImage_Managerについて、画像の削除を試みると、操作が拒否される', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArbitrary(),
          fc.array(imageMetadataArbitrary(), { minLength: 1, maxLength: 5 }),
          async (managerId, images) => {
            // Arrange
            jest.clearAllMocks();

            const imageIds = images.map(img => img.imageId);

            const event: Partial<APIGatewayProxyEvent> = {
              body: JSON.stringify({
                imageIds,
              }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: managerId,
                    'cognito:groups': ['Image_Manager'],
                  },
                },
              } as any,
            };

            // Act
            const result = await imageBulkDeleteHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            // プロパティ: Image_Managerは画像を削除できない
            expect(result.statusCode).toBe(403);
            const responseBody = JSON.parse(result.body);
            expect(responseBody.error.message).toContain('削除できません');

            // deleteItemが呼ばれていないことを確認
            expect(dynamodbClient.deleteItem).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 4.15**
   */
  describe('Property 25: ページ情報表示', () => {
    it('すべてのページについて、ページ表示処理を実行すると、現在のページ位置と総ページ数が正しく表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          fc.array(imageMetadataArbitrary(), { minLength: 50, maxLength: 500 }),
          async (page, allImages) => {
            // Arrange
            jest.clearAllMocks();

            (dynamodbClient.scan as jest.Mock).mockResolvedValue({
              Items: allImages,
            });

            const event: Partial<APIGatewayProxyEvent> = {
              queryStringParameters: {
                page: String(page),
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
            const result = await imageListHandler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);

            // プロパティ: ページ情報が正しく表示される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.pagination.currentPage).toBe(page);
            expect(responseBody.data.pagination.totalCount).toBe(allImages.length);

            const expectedTotalPages = Math.ceil(allImages.length / 50);
            expect(responseBody.data.pagination.totalPages).toBe(expectedTotalPages);

            // hasNextPage、hasPreviousPageが正しいことを確認
            expect(responseBody.data.pagination.hasNextPage).toBe(page < expectedTotalPages);
            expect(responseBody.data.pagination.hasPreviousPage).toBe(page > 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
