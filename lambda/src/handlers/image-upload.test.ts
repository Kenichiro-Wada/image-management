import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// 環境変数を先に設定（ハンドラーのインポート前）
process.env.IMAGES_TABLE = 'test-images-table';
process.env.IMAGES_BUCKET = 'test-images-bucket';

// uuidモジュールをモック
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

import { handler } from './image-upload';

// モック設定
jest.mock('../common/s3-client', () => ({
  putObject: jest.fn(),
}));

jest.mock('../common/dynamodb-client', () => ({
  put: jest.fn(),
}));

jest.mock('../common/logger');

jest.mock('../common/validator', () => ({
  validateImageFile: jest.fn(),
}));

jest.mock('../common/exif-extractor', () => ({
  extractExifMetadata: jest.fn(),
  getImageSize: jest.fn(),
}));

import * as s3Client from '../common/s3-client';
import * as dynamodbClient from '../common/dynamodb-client';
import * as validator from '../common/validator';
import * as exifExtractor from '../common/exif-extractor';

describe('画像アップロードハンドラー', () => {
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
    
    // デフォルトのモック動作
    (validator.validateImageFile as jest.Mock).mockImplementation(() => {});
    (exifExtractor.extractExifMetadata as jest.Mock).mockReturnValue({
      width: 1920,
      height: 1080,
      capturedAt: '2024-01-01T00:00:00.000Z',
    });
    (exifExtractor.getImageSize as jest.Mock).mockReturnValue({
      width: 1920,
      height: 1080,
    });
    (s3Client.putObject as jest.Mock).mockResolvedValue({});
    (dynamodbClient.put as jest.Mock).mockResolvedValue({});
  });

  /**
   * マルチパートフォームデータを生成するヘルパー関数
   */
  function createMultipartFormData(files: Array<{
    filename: string;
    contentType: string;
    content: string;
  }>): { body: string; contentType: string } {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    let body = '';

    for (const file of files) {
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

  describe('正常系', () => {
    it('有効なJPEG画像ファイルをアップロードできる', async () => {
      // Arrange
      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.message).toContain('1件のファイルをアップロードしました');
      expect(responseBody.data.summary.success).toBe(1);
      expect(responseBody.data.summary.failure).toBe(0);
      expect(responseBody.data.results[0].success).toBe(true);
      expect(responseBody.data.results[0].filename).toBe('test.jpg');

      // S3へのアップロードが呼ばれたことを確認
      expect(s3Client.putObject).toHaveBeenCalledTimes(1);
      expect(s3Client.putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'test-images-bucket',
          contentType: 'image/jpeg',
        })
      );

      // DynamoDBへの保存が呼ばれたことを確認
      expect(dynamodbClient.put).toHaveBeenCalledTimes(1);
      expect(dynamodbClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'test-images-table',
          item: expect.objectContaining({
            fileName: 'test.jpg',
            mimeType: 'image/jpeg',
            ownerId: 'test-user-id',
            ownerName: 'Test User',
            isPublic: false,
            tags: [],
          }),
        })
      );
    });

    it('複数のJPEG画像ファイルを一括アップロードできる', async () => {
      // Arrange
      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test1.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content-1',
        },
        {
          filename: 'test2.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content-2',
        },
        {
          filename: 'test3.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content-3',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.message).toContain('3件のファイルをアップロードしました');
      expect(responseBody.data.summary.success).toBe(3);
      expect(responseBody.data.summary.failure).toBe(0);

      // S3へのアップロードが3回呼ばれたことを確認
      expect(s3Client.putObject).toHaveBeenCalledTimes(3);

      // DynamoDBへの保存が3回呼ばれたことを確認
      expect(dynamodbClient.put).toHaveBeenCalledTimes(3);
    });

    it('EXIF情報を含む画像をアップロードできる', async () => {
      // Arrange
      (exifExtractor.extractExifMetadata as jest.Mock).mockReturnValue({
        width: 3000,
        height: 2000,
        capturedAt: '2023-12-25T10:30:00.000Z',
        cameraMake: 'Canon',
        cameraModel: 'EOS R5',
        orientation: 1,
        latitude: 35.6762,
        longitude: 139.6503,
        iso: 400,
        fNumber: 2.8,
        exposureTime: '1/250',
        focalLength: 50,
      });

      const { body, contentType } = createMultipartFormData([
        {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-with-exif',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.results[0].success).toBe(true);

      // EXIF情報がDynamoDBに保存されることを確認
      expect(dynamodbClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            width: 3000,
            height: 2000,
            capturedAt: '2023-12-25T10:30:00.000Z',
            cameraMake: 'Canon',
            cameraModel: 'EOS R5',
            orientation: 1,
            latitude: 35.6762,
            longitude: 139.6503,
            iso: 400,
            fNumber: 2.8,
            exposureTime: '1/250',
            focalLength: 50,
          }),
        })
      );
    });

    it('一部のファイルが失敗しても他のファイルはアップロードされる', async () => {
      // Arrange
      (validator.validateImageFile as jest.Mock)
        .mockImplementationOnce(() => {}) // 1つ目は成功
        .mockImplementationOnce(() => {
          throw new Error('無効なファイル形式');
        }) // 2つ目は失敗
        .mockImplementationOnce(() => {}); // 3つ目は成功

      const { body, contentType } = createMultipartFormData([
        {
          filename: 'valid1.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content-1',
        },
        {
          filename: 'invalid.png',
          contentType: 'image/png',
          content: 'fake-png-content',
        },
        {
          filename: 'valid2.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content-2',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.message).toContain('2件のファイルをアップロードしました');
      expect(responseBody.data.summary.success).toBe(2);
      expect(responseBody.data.summary.failure).toBe(1);

      // 成功したファイル
      expect(responseBody.data.results[0].success).toBe(true);
      expect(responseBody.data.results[0].filename).toBe('valid1.jpg');
      expect(responseBody.data.results[2].success).toBe(true);
      expect(responseBody.data.results[2].filename).toBe('valid2.jpg');

      // 失敗したファイル
      expect(responseBody.data.results[1].success).toBe(false);
      expect(responseBody.data.results[1].filename).toBe('invalid.png');
      expect(responseBody.data.results[1].error).toContain('無効なファイル形式');

      // S3へのアップロードは2回のみ
      expect(s3Client.putObject).toHaveBeenCalledTimes(2);
      expect(dynamodbClient.put).toHaveBeenCalledTimes(2);
    });
  });

  describe('異常系', () => {
    it('リクエストボディがない場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: null,
        headers: {},
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error.message).toContain('画像ファイルが指定されていません');
    });

    it('Content-Typeがmultipart/form-dataでない場合はエラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: 'some-body',
        headers: {
          'content-type': 'application/json',
        },
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error.message).toContain('Content-Typeはmultipart/form-dataである必要があります');
    });

    it('ファイルが含まれていない場合はエラーを返す', async () => {
      // Arrange
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const body = `------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n`;

      const event: Partial<APIGatewayProxyEvent> = {
        body: Buffer.from(body, 'binary').toString('base64'),
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.error.message).toContain('アップロードする画像ファイルが見つかりません');
    });

    it('ファイルサイズが制限を超える場合は個別にエラーを返す', async () => {
      // Arrange
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // 101MB
      const { body, contentType } = createMultipartFormData([
        {
          filename: 'large.jpg',
          contentType: 'image/jpeg',
          content: largeContent,
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.summary.success).toBe(0);
      expect(responseBody.data.summary.failure).toBe(1);
      expect(responseBody.data.results[0].success).toBe(false);
      expect(responseBody.data.results[0].error).toContain('ファイルサイズが制限');

      // S3へのアップロードは呼ばれない
      expect(s3Client.putObject).not.toHaveBeenCalled();
      expect(dynamodbClient.put).not.toHaveBeenCalled();
    });

    it('JPEG以外のファイル形式は拒否される', async () => {
      // Arrange
      (validator.validateImageFile as jest.Mock).mockImplementation(() => {
        throw new Error('JPEG形式のみサポートされています');
      });

      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test.png',
          contentType: 'image/png',
          content: 'fake-png-content',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.summary.success).toBe(0);
      expect(responseBody.data.summary.failure).toBe(1);
      expect(responseBody.data.results[0].success).toBe(false);
      expect(responseBody.data.results[0].error).toContain('JPEG形式のみサポートされています');

      // S3へのアップロードは呼ばれない
      expect(s3Client.putObject).not.toHaveBeenCalled();
      expect(dynamodbClient.put).not.toHaveBeenCalled();
    });

    it('S3アップロードが失敗した場合はエラーを返す', async () => {
      // Arrange
      (s3Client.putObject as jest.Mock).mockRejectedValue(new Error('S3アップロード失敗'));

      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.summary.success).toBe(0);
      expect(responseBody.data.summary.failure).toBe(1);
      expect(responseBody.data.results[0].success).toBe(false);
      expect(responseBody.data.results[0].error).toContain('S3アップロード失敗');

      // DynamoDBへの保存は呼ばれない
      expect(dynamodbClient.put).not.toHaveBeenCalled();
    });

    it('DynamoDBへの保存が失敗した場合はエラーを返す', async () => {
      // Arrange
      (dynamodbClient.put as jest.Mock).mockRejectedValue(new Error('DynamoDB保存失敗'));

      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body);
      expect(responseBody.data.summary.success).toBe(0);
      expect(responseBody.data.summary.failure).toBe(1);
      expect(responseBody.data.results[0].success).toBe(false);
      expect(responseBody.data.results[0].error).toContain('DynamoDB保存失敗');
    });
  });

  describe('メタデータ生成', () => {
    it('アップロード時に適切なメタデータが生成される', async () => {
      // Arrange
      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              name: 'Test User',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(dynamodbClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            PK: expect.stringMatching(/^IMAGE#/),
            SK: 'METADATA',
            imageId: expect.any(String),
            fileName: 'test.jpg',
            fileSize: expect.any(Number),
            mimeType: 'image/jpeg',
            width: 1920,
            height: 1080,
            uploadedAt: expect.any(String),
            capturedAt: expect.any(String),
            tags: [],
            isPublic: false,
            ownerId: 'test-user-id',
            ownerName: 'Test User',
            s3Key: expect.any(String),
            thumbnailKeys: {
              small: '',
              medium: '',
              large: '',
            },
            GSI1PK: 'USER#test-user-id',
            GSI1SK: expect.any(String),
            GSI2PK: 'PUBLIC#false',
            GSI2SK: expect.any(String),
          }),
        })
      );
    });

    it('所有者情報が正しく設定される', async () => {
      // Arrange
      const { body, contentType } = createMultipartFormData([
        {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          content: 'fake-jpeg-content',
        },
      ]);

      const event: Partial<APIGatewayProxyEvent> = {
        body,
        headers: {
          'content-type': contentType,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
              name: 'John Doe',
            },
          },
        } as any,
      };

      // Act
      await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(dynamodbClient.put).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            ownerId: 'user-123',
            ownerName: 'John Doe',
            GSI1PK: 'USER#user-123',
          }),
        })
      );
    });
  });
});
