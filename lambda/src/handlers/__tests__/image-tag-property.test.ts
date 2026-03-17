/**
 * プロパティベーステスト: タグ管理機能
 * 
 * 設計書の正確性プロパティ7-10を検証
 */

// 環境変数の設定（ハンドラーインポート前に設定）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.TAGS_TABLE = 'test-tags-table';

// モック設定（ハンドラーインポート前に設定）
jest.mock('../../common/dynamodb-client', () => ({
  get: jest.fn(),
  update: jest.fn(),
  put: jest.fn(),
}));

jest.mock('../../common/logger');

import * as fc from 'fast-check';
import { handler as addTagHandler } from '../image-tag-add';
import { handler as deleteTagHandler } from '../image-tag-delete';
import * as dynamodbClient from '../../common/dynamodb-client';

const mockGet = dynamodbClient.get as jest.MockedFunction<typeof dynamodbClient.get>;
const mockUpdate = dynamodbClient.update as jest.MockedFunction<typeof dynamodbClient.update>;
const mockPut = dynamodbClient.put as jest.MockedFunction<typeof dynamodbClient.put>;

describe('Feature: image-management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 7: タグ追加保存', () => {
    it('すべての画像とタグの組み合わせについて、タグ追加処理を実行すると、そのタグが画像のメタデータに正しく保存される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),                                    // imageId
          fc.string({ minLength: 1, maxLength: 50 }),  // tagName
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }), // existingTags
          async (imageId, tagName, existingTags) => {
            // 重複を避けるため、既存タグに新しいタグが含まれていない場合のみテスト
            fc.pre(!existingTags.includes(tagName.trim()));
            
            const normalizedTagName = tagName.trim();
            fc.pre(normalizedTagName.length > 0); // 空白のみのタグは除外
            
            // モックの設定
            mockGet.mockResolvedValueOnce({
              PK: `IMAGE#${imageId}`,
              SK: 'METADATA',
              imageId,
              ownerId: 'test-user',
              tags: existingTags,
            });
            
            mockGet.mockResolvedValueOnce(undefined); // タグメタデータは存在しない
            
            let capturedTags: string[] = [];
            mockUpdate.mockImplementation(async (params: any) => {
              if (params.tableName === process.env.IMAGES_TABLE) {
                capturedTags = params.expressionAttributeValues[':tags'];
              }
              return undefined;
            });
            
            mockPut.mockResolvedValue(undefined);
            
            // タグ追加処理を実行
            const event: any = {
              pathParameters: { id: imageId },
              body: JSON.stringify({ tagName }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: 'test-user',
                    'cognito:groups': ['System_Admin'],
                  },
                },
              },
            };
            
            const result = await addTagHandler(event, {} as any);
            
            // プロパティ検証: タグが正しく保存される
            expect(result.statusCode).toBe(200);
            expect(capturedTags).toContain(normalizedTagName);
            expect(capturedTags.length).toBe(existingTags.length + 1);
            
            // 既存のタグも保持されている
            existingTags.forEach(tag => {
              expect(capturedTags).toContain(tag);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 8: タグ削除', () => {
    it('すべてのタグ付き画像について、特定のタグ削除処理を実行すると、そのタグが画像のメタデータから削除される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),                                    // imageId
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }), // existingTags
          fc.nat(),                                     // deleteIndex
          async (imageId, existingTags, deleteIndex) => {
            const tagToDelete = existingTags[deleteIndex % existingTags.length];
            
            // モックの設定
            mockGet.mockResolvedValueOnce({
              PK: `IMAGE#${imageId}`,
              SK: 'METADATA',
              imageId,
              ownerId: 'test-user',
              tags: existingTags,
            });
            
            mockGet.mockResolvedValueOnce({
              PK: `TAG#${tagToDelete}`,
              SK: 'METADATA',
              tagName: tagToDelete,
              usageCount: 5,
            });
            
            let capturedTags: string[] = [];
            mockUpdate.mockImplementation(async (params: any) => {
              if (params.tableName === process.env.IMAGES_TABLE) {
                capturedTags = params.expressionAttributeValues[':tags'];
              }
              return undefined;
            });
            
            // タグ削除処理を実行
            const event: any = {
              pathParameters: { 
                id: imageId,
                tagName: encodeURIComponent(tagToDelete),
              },
              requestContext: {
                authorizer: {
                  claims: {
                    sub: 'test-user',
                    'cognito:groups': ['System_Admin'],
                  },
                },
              },
            };
            
            const result = await deleteTagHandler(event, {} as any);
            
            // プロパティ検証: タグが削除される
            expect(result.statusCode).toBe(200);
            expect(capturedTags).not.toContain(tagToDelete);
            expect(capturedTags.length).toBe(existingTags.length - 1);
            
            // 他のタグは保持されている
            existingTags.forEach(tag => {
              if (tag !== tagToDelete) {
                expect(capturedTags).toContain(tag);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 9: 複数タグ追加', () => {
    it('すべての画像と複数タグの組み合わせについて、複数タグ追加処理を実行すると、すべてのタグが画像のメタデータに保存される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),                                    // imageId
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }), // tagsToAdd
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }), // existingTags
          async (imageId, tagsToAdd, existingTags) => {
            // 重複を避けるため、既存タグと新しいタグが重複していない場合のみテスト
            const normalizedTagsToAdd = tagsToAdd.map(t => t.trim()).filter(t => t.length > 0);
            fc.pre(normalizedTagsToAdd.length > 0);
            fc.pre(normalizedTagsToAdd.every(tag => !existingTags.includes(tag)));
            
            let currentTags = [...existingTags];
            
            // 各タグを順番に追加
            for (const tagName of normalizedTagsToAdd) {
              mockGet.mockResolvedValueOnce({
                PK: `IMAGE#${imageId}`,
                SK: 'METADATA',
                imageId,
                ownerId: 'test-user',
                tags: currentTags,
              });
              
              mockGet.mockResolvedValueOnce(undefined); // タグメタデータは存在しない
              
              mockUpdate.mockImplementation(async (params: any) => {
                if (params.tableName === process.env.IMAGES_TABLE) {
                  currentTags = params.expressionAttributeValues[':tags'];
                }
                return undefined;
              });
              
              mockPut.mockResolvedValue(undefined);
              
              const event: any = {
                pathParameters: { id: imageId },
                body: JSON.stringify({ tagName }),
                requestContext: {
                  authorizer: {
                    claims: {
                      sub: 'test-user',
                      'cognito:groups': ['System_Admin'],
                    },
                  },
                },
              };
              
              await addTagHandler(event, {} as any);
            }
            
            // プロパティ検証: すべてのタグが保存される
            normalizedTagsToAdd.forEach(tag => {
              expect(currentTags).toContain(tag);
            });
            
            // 既存のタグも保持されている
            existingTags.forEach(tag => {
              expect(currentTags).toContain(tag);
            });
            
            expect(currentTags.length).toBe(existingTags.length + normalizedTagsToAdd.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10: タグ重複防止', () => {
    it('すべての既存タグ付き画像について、同じタグを再度追加しようとすると、重複が防がれ、タグは1つのみ保持される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),                                    // imageId
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }), // existingTags
          fc.nat(),                                     // duplicateIndex
          async (imageId, existingTags, duplicateIndex) => {
            const duplicateTag = existingTags[duplicateIndex % existingTags.length];
            
            // 空白のみのタグは除外
            fc.pre(duplicateTag.trim().length > 0);
            
            // モックの設定
            mockGet.mockResolvedValueOnce({
              PK: `IMAGE#${imageId}`,
              SK: 'METADATA',
              imageId,
              ownerId: 'test-user',
              tags: existingTags,
            });
            
            // タグ追加処理を実行（重複タグ）
            const event: any = {
              pathParameters: { id: imageId },
              body: JSON.stringify({ tagName: duplicateTag }),
              requestContext: {
                authorizer: {
                  claims: {
                    sub: 'test-user',
                    'cognito:groups': ['System_Admin'],
                  },
                },
              },
            };
            
            const result = await addTagHandler(event, {} as any);
            
            // プロパティ検証: エラーが返される
            expect(result.statusCode).toBe(400);
            
            const body = JSON.parse(result.body);
            expect(body.error.message).toContain('既に追加されています');
            
            // updateが呼ばれていない（タグが追加されていない）
            expect(mockUpdate).not.toHaveBeenCalledWith(
              expect.objectContaining({
                tableName: process.env.IMAGES_TABLE,
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
