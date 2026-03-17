/**
 * プロパティベーステスト: 検索・フィルタリング機能
 * 
 * 設計書の正確性プロパティ33-35を検証
 */

// 環境変数の設定（ハンドラーインポート前に設定）
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

jest.mock('../../common/logger');

import * as fc from 'fast-check';
import { handler } from '../image-search';

describe('Feature: image-management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルトのモック動作を設定
    mockSend.mockResolvedValue({
      Items: [],
      LastEvaluatedKey: undefined,
    });
  });

  describe('Property 33: キーワード検索', () => {
    it('すべての検索キーワードについて、検索処理を実行すると、ファイル名とタグに基づく正しい検索結果が返される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),  // keyword（空白のみを除外）
          fc.array(
            fc.record({
              imageId: fc.uuid(),
              fileName: fc.string({ minLength: 1, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
              GSI2PK: fc.constant('PUBLIC#true'),
              GSI2SK: fc.string(),
              fileSize: fc.nat(),
              mimeType: fc.constant('image/jpeg'),
              width: fc.nat({ max: 4000 }),
              height: fc.nat({ max: 4000 }),
              uploadedAt: fc.date().map(d => d.toISOString()),
              capturedAt: fc.date().map(d => d.toISOString()),
              s3Key: fc.string(),
              thumbnailKeys: fc.record({
                small: fc.string(),
                medium: fc.string(),
                large: fc.string(),
              }),
              ownerName: fc.string(),
            }),
            { minLength: 0, maxLength: 30 }
          ),  // images
          async (keyword, images) => {
            // モックの設定
            mockSend.mockResolvedValue({
              Items: images,
              LastEvaluatedKey: undefined,
            });

            // 検索処理を実行
            const event: any = {
              queryStringParameters: {
                keyword,
                limit: '20',
              },
            };

            const result = await handler(event);

            // プロパティ検証: 検索結果が正しい
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            // 返された画像がすべてキーワードに一致する
            const lowerKeyword = keyword.toLowerCase();
            body.images.forEach((image: any) => {
              const fileNameMatch = image.fileName.toLowerCase().includes(lowerKeyword);
              const tagsMatch = image.tags.some((tag: string) =>
                tag.toLowerCase().includes(lowerKeyword)
              );
              expect(fileNameMatch || tagsMatch).toBe(true);
            });

            // 元の画像でキーワードに一致するものがすべて含まれている
            const expectedImages = images.filter(img => {
              const fileNameMatch = img.fileName.toLowerCase().includes(lowerKeyword);
              const tagsMatch = img.tags.some(tag =>
                tag.toLowerCase().includes(lowerKeyword)
              );
              return fileNameMatch || tagsMatch;
            });

            expect(body.images.length).toBe(Math.min(expectedImages.length, 20));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 34: 複合フィルター', () => {
    it('すべてのフィルター条件の組み合わせについて、フィルター処理を実行すると、すべての条件に一致する画像のみが表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }),  // filterTags
          fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),  // dateFrom
          fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }),  // dateTo
          fc.array(
            fc.record({
              imageId: fc.uuid(),
              fileName: fc.string({ minLength: 1, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
              capturedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString()),
              GSI2PK: fc.constant('PUBLIC#true'),
              GSI2SK: fc.string(),
              fileSize: fc.nat(),
              mimeType: fc.constant('image/jpeg'),
              width: fc.nat({ max: 4000 }),
              height: fc.nat({ max: 4000 }),
              uploadedAt: fc.date().map(d => d.toISOString()),
              s3Key: fc.string(),
              thumbnailKeys: fc.record({
                small: fc.string(),
                medium: fc.string(),
                large: fc.string(),
              }),
              ownerName: fc.string(),
            }),
            { minLength: 0, maxLength: 30 }
          ),  // images
          async (filterTags, dateFrom, dateTo, images) => {
            // 日付の順序を保証
            const [startDate, endDate] = dateFrom <= dateTo ? [dateFrom, dateTo] : [dateTo, dateFrom];

            // モックの設定
            mockSend.mockResolvedValue({
              Items: images,
              LastEvaluatedKey: undefined,
            });

            // 複合フィルター処理を実行
            const event: any = {
              queryStringParameters: {
                tags: filterTags.join(','),
                dateFrom: startDate.toISOString().split('T')[0],
                dateTo: endDate.toISOString().split('T')[0],
                limit: '20',
              },
            };

            const result = await handler(event);

            // プロパティ検証: すべての条件に一致する画像のみが返される
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            body.images.forEach((image: any) => {
              // タグフィルター: すべてのフィルタータグが含まれている
              filterTags.forEach(filterTag => {
                const hasTag = image.tags.some((tag: string) =>
                  tag.toLowerCase() === filterTag.toLowerCase()
                );
                expect(hasTag).toBe(true);
              });

              // 撮影日フィルター: 範囲内の日付
              if (image.capturedAt) {
                const capturedDate = new Date(image.capturedAt);
                expect(capturedDate >= startDate).toBe(true);
                expect(capturedDate <= endDate).toBe(true);
              }
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 35: フィルタークリア', () => {
    it('すべてのフィルター適用状態について、フィルタークリア処理を実行すると、すべての画像が再表示される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              imageId: fc.uuid(),
              fileName: fc.string({ minLength: 1, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
              capturedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString()),
              GSI2PK: fc.constant('PUBLIC#true'),
              GSI2SK: fc.string(),
              fileSize: fc.nat(),
              mimeType: fc.constant('image/jpeg'),
              width: fc.nat({ max: 4000 }),
              height: fc.nat({ max: 4000 }),
              uploadedAt: fc.date().map(d => d.toISOString()),
              s3Key: fc.string(),
              thumbnailKeys: fc.record({
                small: fc.string(),
                medium: fc.string(),
                large: fc.string(),
              }),
              ownerName: fc.string(),
            }),
            { minLength: 1, maxLength: 30 }
          ),  // images
          async (images) => {
            // モックの設定
            mockSend.mockResolvedValue({
              Items: images,
              LastEvaluatedKey: undefined,
            });

            // フィルタークリア（パラメータなし）で検索処理を実行
            const event: any = {
              queryStringParameters: {
                limit: '100',  // すべての画像を取得
              },
            };

            const result = await handler(event);

            // プロパティ検証: すべての画像が返される
            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);

            // フィルターなしの場合、すべての画像が返される（limit以内）
            expect(body.images.length).toBe(Math.min(images.length, 100));

            // 返された画像IDがすべて元の画像に含まれている
            body.images.forEach((image: any) => {
              const found = images.some(img => img.imageId === image.imageId);
              expect(found).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
