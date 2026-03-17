import * as fc from 'fast-check';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定
process.env.IMAGES_TABLE = 'test-images-table';
process.env.IMAGES_BUCKET = 'test-images-bucket';

// uuidモジュールをモック
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-${++uuidCounter}`),
}));

import { handler } from '../image-upload';

// モック設定
jest.mock('../../common/s3-client', () => ({
  putObject: jest.fn(),
}));

jest.mock('../../common/dynamodb-client', () => ({
  put: jest.fn(),
}));

jest.mock('../../common/logger');

jest.mock('../../common/validator', () => ({
  validateImageFile: jest.fn(),
}));

jest.mock('../../common/exif-extractor', () => ({
  extractExifMetadata: jest.fn(),
  getImageSize: jest.fn(),
}));

import * as s3Client from '../../common/s3-client';
import * as dynamodbClient from '../../common/dynamodb-client';
import * as validator from '../../common/validator';
import * as exifExtractor from '../../common/exif-extractor';

/**
 * プロパティベーステスト: 画像アップロード機能
 * 
 * 設計書の正確性プロパティ1-6を検証
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

// マルチパートフォームデータを生成するヘルパー関数
function createMultipartFormData(files: Array<{
  filename: string;
  contentType: string;
  content: string;
  folderPath?: string;
}>): { body: string; contentType: string } {
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';

  for (const file of files) {
    // フォルダパス情報がある場合は先に送信
    if (file.folderPath) {
      body += `------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n`;
      body += `Content-Disposition: form-data; name="folderPath"\r\n`;
      body += `\r\n`;
      body += file.folderPath;
      body += `\r\n`;
    }

    body += `------WebKitFormBoundary7MA4YWxkTrZu0gW\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`;
    body += `Content-Type: ${file.contentType}\r\n`;
    body += `\r\n`;
    body += file.content;
    body += `\r\n`;
  }

  body += `------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n`;

  return {
    body: Buffer.from(body, 'binary').toString('base64'),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// Arbitraries（テストデータジェネレーター）

// 有効なJPEGファイル名を生成
const validJpegFilenameArbitrary = () =>
  fc.tuple(
    fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}$/),
    fc.constantFrom('.jpg', '.jpeg', '.JPG', '.JPEG')
  ).map(([name, ext]) => `${name}${ext}`);

// 有効なJPEG画像ファイルを生成
const validJpegFileArbitrary = () =>
  fc.record({
    filename: validJpegFilenameArbitrary(),
    contentType: fc.constantFrom('image/jpeg', 'image/jpg'),
    content: fc.stringMatching(/^.{100,10000}$/), // 100バイト〜10KBのコンテンツ
  });

// 無効なファイル形式を生成
const invalidFileFormatArbitrary = () =>
  fc.record({
    filename: fc.oneof(
      fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}\.png$/),
      fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}\.gif$/),
      fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}\.bmp$/),
      fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}\.txt$/),
      fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}\.pdf$/)
    ),
    contentType: fc.constantFrom('image/png', 'image/gif', 'image/bmp', 'text/plain', 'application/pdf'),
    content: fc.stringMatching(/^.{100,10000}$/),
  });

// フォルダパスを生成
const folderPathArbitrary = () =>
  fc.array(fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/), { minLength: 1, maxLength: 3 })
    .map(parts => parts.join('/'));

describe('Feature: image-management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;

    // デフォルトのモック動作
    (validator.validateImageFile as jest.Mock).mockImplementation(() => {});
    (exifExtractor.extractExifMetadata as jest.Mock).mockReturnValue({
      width: 1920,
      height: 1080,
      capturedAt: new Date().toISOString(),
    });
    (exifExtractor.getImageSize as jest.Mock).mockReturnValue({
      width: 1920,
      height: 1080,
    });
    (s3Client.putObject as jest.Mock).mockResolvedValue({});
    (dynamodbClient.put as jest.Mock).mockResolvedValue({});
  });

  /**
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: 有効画像アップロード保存', () => {
    it('すべての有効なJPEG画像ファイルがS3に正しく保存される', async () => {
      await fc.assert(
        fc.asyncProperty(
          validJpegFileArbitrary(),
          async (file) => {
            // Arrange
            jest.clearAllMocks();
            (validator.validateImageFile as jest.Mock).mockImplementation(() => {});
            (s3Client.putObject as jest.Mock).mockResolvedValue({});
            (dynamodbClient.put as jest.Mock).mockResolvedValue({});

            const { body, contentType } = createMultipartFormData([file]);
            const event: Partial<APIGatewayProxyEvent> = {
              body,
              headers: { 'content-type': contentType },
              requestContext: {
                authorizer: {
                  claims: { sub: 'test-user', name: 'Test User' },
                },
              } as any,
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            
            // プロパティ: 有効なJPEGファイルは必ずS3に保存される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.summary.success).toBe(1);
            expect(s3Client.putObject).toHaveBeenCalledTimes(1);
            expect(s3Client.putObject).toHaveBeenCalledWith(
              expect.objectContaining({
                bucket: 'test-images-bucket',
                contentType: file.contentType,
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: 複数ファイル一括アップロード', () => {
    it('すべての有効なJPEG画像ファイルの配列について、一括アップロード処理を実行すると、すべてのファイルがS3ストレージに保存される', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validJpegFileArbitrary(), { minLength: 1, maxLength: 5 }),
          async (files) => {
            // Arrange
            jest.clearAllMocks();
            (validator.validateImageFile as jest.Mock).mockImplementation(() => {});
            (s3Client.putObject as jest.Mock).mockResolvedValue({});
            (dynamodbClient.put as jest.Mock).mockResolvedValue({});

            const { body, contentType } = createMultipartFormData(files);
            const event: Partial<APIGatewayProxyEvent> = {
              body,
              headers: { 'content-type': contentType },
              requestContext: {
                authorizer: {
                  claims: { sub: 'test-user', name: 'Test User' },
                },
              } as any,
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            
            // プロパティ: すべてのファイルがS3に保存される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.summary.success).toBe(files.length);
            expect(responseBody.data.summary.failure).toBe(0);
            expect(s3Client.putObject).toHaveBeenCalledTimes(files.length);
            expect(dynamodbClient.put).toHaveBeenCalledTimes(files.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 1.3**
   */
  describe('Property 3: フォルダアップロード完全性', () => {
    it('すべてのJPEG画像ファイルを含むフォルダについて、フォルダアップロード処理を実行すると、フォルダ内のすべてのJPEG画像ファイルがS3ストレージに保存される', async () => {
      await fc.assert(
        fc.asyncProperty(
          folderPathArbitrary(),
          fc.array(validJpegFileArbitrary(), { minLength: 1, maxLength: 5 }),
          async (folderPath, files) => {
            // Arrange
            jest.clearAllMocks();
            (validator.validateImageFile as jest.Mock).mockImplementation(() => {});
            (s3Client.putObject as jest.Mock).mockResolvedValue({});
            (dynamodbClient.put as jest.Mock).mockResolvedValue({});

            // フォルダパス情報を各ファイルに追加
            const filesWithFolder = files.map(f => ({ ...f, folderPath }));
            const { body, contentType } = createMultipartFormData(filesWithFolder);
            const event: Partial<APIGatewayProxyEvent> = {
              body,
              headers: { 'content-type': contentType },
              requestContext: {
                authorizer: {
                  claims: { sub: 'test-user', name: 'Test User' },
                },
              } as any,
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            
            // プロパティ: フォルダ内のすべてのファイルがS3に保存される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.summary.success).toBe(files.length);
            expect(s3Client.putObject).toHaveBeenCalledTimes(files.length);
            
            // フォルダパス情報がS3キーに含まれることを確認
            const s3Calls = (s3Client.putObject as jest.Mock).mock.calls;
            s3Calls.forEach((call) => {
              expect(call[0].key).toContain(folderPath);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 1.4**
   */
  describe('Property 4: 無効ファイル拒否', () => {
    it('すべてのJPEG以外のファイル形式について、アップロード処理を実行すると、エラーメッセージが返され、ファイルはS3ストレージに保存されない', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidFileFormatArbitrary(),
          async (file) => {
            // Arrange
            jest.clearAllMocks();
            (validator.validateImageFile as jest.Mock).mockImplementation(() => {
              throw new Error('JPEG形式のみサポートされています');
            });

            const { body, contentType } = createMultipartFormData([file]);
            const event: Partial<APIGatewayProxyEvent> = {
              body,
              headers: { 'content-type': contentType },
              requestContext: {
                authorizer: {
                  claims: { sub: 'test-user', name: 'Test User' },
                },
              } as any,
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            
            // プロパティ: 無効なファイルは拒否され、S3に保存されない
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.summary.success).toBe(0);
            expect(responseBody.data.summary.failure).toBe(1);
            expect(responseBody.data.results[0].success).toBe(false);
            expect(responseBody.data.results[0].error).toBeTruthy();
            expect(s3Client.putObject).not.toHaveBeenCalled();
            expect(dynamodbClient.put).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 1.5**
   */
  describe('Property 5: メタデータ自動生成', () => {
    it('すべての画像ファイルについて、アップロード処理を実行すると、適切なメタデータがDynamoDBに保存される', async () => {
      await fc.assert(
        fc.asyncProperty(
          validJpegFileArbitrary(),
          fc.string({ minLength: 5, maxLength: 20 }), // userId
          fc.string({ minLength: 5, maxLength: 30 }), // userName
          async (file, userId, userName) => {
            // Arrange
            jest.clearAllMocks();
            (validator.validateImageFile as jest.Mock).mockImplementation(() => {});
            (s3Client.putObject as jest.Mock).mockResolvedValue({});
            (dynamodbClient.put as jest.Mock).mockResolvedValue({});

            const { body, contentType } = createMultipartFormData([file]);
            const event: Partial<APIGatewayProxyEvent> = {
              body,
              headers: { 'content-type': contentType },
              requestContext: {
                authorizer: {
                  claims: { sub: userId, name: userName },
                },
              } as any,
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            
            // プロパティ: メタデータが自動生成され、DynamoDBに保存される
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.summary.success).toBe(1);
            expect(dynamodbClient.put).toHaveBeenCalledTimes(1);
            expect(dynamodbClient.put).toHaveBeenCalledWith(
              expect.objectContaining({
                tableName: 'test-images-table',
                item: expect.objectContaining({
                  PK: expect.stringMatching(/^IMAGE#/),
                  SK: 'METADATA',
                  imageId: expect.any(String),
                  fileName: file.filename,
                  fileSize: expect.any(Number),
                  mimeType: file.contentType,
                  uploadedAt: expect.any(String),
                  ownerId: userId,
                  ownerName: userName,
                  s3Key: expect.any(String),
                  tags: [],
                  isPublic: false,
                }),
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 1.7**
   */
  describe('Property 6: ファイルサイズ制限', () => {
    it('すべての制限サイズを超えるファイルについて、アップロード処理を実行すると、エラーメッセージが返され、ファイルはS3ストレージに保存されない', async () => {
      await fc.assert(
        fc.asyncProperty(
          validJpegFilenameArbitrary(),
          fc.integer({ min: 101 * 1024 * 1024, max: 200 * 1024 * 1024 }), // 101MB〜200MB
          async (filename, fileSize) => {
            // Arrange
            jest.clearAllMocks();
            (validator.validateImageFile as jest.Mock).mockImplementation(() => {});

            const largeContent = 'x'.repeat(fileSize);
            const { body, contentType } = createMultipartFormData([
              {
                filename,
                contentType: 'image/jpeg',
                content: largeContent,
              },
            ]);
            const event: Partial<APIGatewayProxyEvent> = {
              body,
              headers: { 'content-type': contentType },
              requestContext: {
                authorizer: {
                  claims: { sub: 'test-user', name: 'Test User' },
                },
              } as any,
            };

            // Act
            const result = await handler(event as APIGatewayProxyEvent, mockContext);

            // Assert
            const responseBody = JSON.parse(result.body);
            
            // プロパティ: サイズ超過ファイルは拒否され、S3に保存されない
            expect(result.statusCode).toBe(200);
            expect(responseBody.data.summary.success).toBe(0);
            expect(responseBody.data.summary.failure).toBe(1);
            expect(responseBody.data.results[0].success).toBe(false);
            expect(responseBody.data.results[0].error).toContain('ファイルサイズが制限');
            expect(s3Client.putObject).not.toHaveBeenCalled();
            expect(dynamodbClient.put).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 50 } // ファイルサイズが大きいため実行回数を減らす
      );
    });
  });
});
