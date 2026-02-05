---
inclusion: always
---

# コーディングガイドライン

## 概要

このドキュメントは、画像管理システムプロジェクトにおけるコーディング規約とベストプラクティスを定義します。すべての開発者はこのガイドラインに従ってコードを記述してください。

## 1. 命名規則

### 1.1 変数・関数
- **camelCase**を使用
- 動詞で始める（関数の場合）
- 意味のある名前を付ける

```typescript
// Good
const imageCount = 10;
const getUserById = (id: string) => { ... };
const isPublic = true;

// Bad
const img_count = 10;
const GetUserById = (id: string) => { ... };
const x = true;
```

### 1.2 クラス・インターフェース・型
- **PascalCase**を使用
- 名詞で命名
- インターフェースには`I`プレフィックスを付けない

```typescript
// Good
class ImageUploader { ... }
interface UserMetadata { ... }
type ImageStatus = 'pending' | 'uploaded' | 'failed';

// Bad
class imageUploader { ... }
interface IUserMetadata { ... }
type imageStatus = 'pending' | 'uploaded' | 'failed';
```

### 1.3 定数
- **UPPER_SNAKE_CASE**を使用
- グローバル定数に使用

```typescript
// Good
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const SUPPORTED_FORMATS = ['image/jpeg', 'image/jpg'];
const API_BASE_URL = process.env.API_URL;

// Bad
const maxFileSize = 100 * 1024 * 1024;
const supportedFormats = ['image/jpeg', 'image/jpg'];
```

### 1.4 ファイル名
- **kebab-case**を使用
- 内容を表す名前を付ける

```
// Good
image-upload-handler.ts
user-authentication.service.ts
dynamodb-client.ts

// Bad
ImageUploadHandler.ts
userAuthenticationService.ts
DynamoDBClient.ts
```

### 1.5 AWS リソース名
- **PascalCase**を使用（CDK）
- プロジェクトプレフィックスを付ける

```typescript
// Good
const imagesBucket = new s3.Bucket(this, 'ImageManagementImagesBucket');
const imagesTable = new dynamodb.Table(this, 'ImageManagementImagesTable');

// Bad
const bucket = new s3.Bucket(this, 'images');
const table = new dynamodb.Table(this, 'images_table');
```

## 2. TypeScript規約

### 2.1 型定義
- 型推論を活用し、明らかな場合は型を省略
- 関数の戻り値の型は明示的に指定
- `any`の使用は禁止、代わりに`unknown`を使用

```typescript
// Good
const imageId = 'abc123'; // 型推論
const getImageById = (id: string): Promise<ImageMetadata | null> => { ... };
const parseJson = (data: unknown): Record<string, unknown> => { ... };

// Bad
const imageId: string = 'abc123'; // 不要な型指定
const getImageById = (id: string) => { ... }; // 戻り値の型なし
const parseJson = (data: any): any => { ... }; // any使用
```

### 2.2 インターフェース vs Type Alias
- オブジェクトの形状定義には**インターフェース**を優先
- ユニオン型、交差型には**Type Alias**を使用

```typescript
// Good
interface ImageMetadata {
  imageId: string;
  fileName: string;
  uploadedAt: string;
}

type ImageStatus = 'pending' | 'uploaded' | 'failed';
type UserRole = 'SYSTEM_ADMIN' | 'IMAGE_MANAGER' | 'REGULAR_USER';

// Bad
type ImageMetadata = {
  imageId: string;
  fileName: string;
  uploadedAt: string;
};

interface ImageStatus {
  status: 'pending' | 'uploaded' | 'failed';
}
```

### 2.3 Null vs Undefined
- 明示的な「値がない」状態には`null`を使用
- 初期化されていない状態には`undefined`を使用
- オプショナルプロパティには`?`を使用

```typescript
// Good
interface ImageMetadata {
  imageId: string;
  capturedAt?: string; // オプショナル（undefined）
  description: string | null; // 明示的にnullを許可
}

const getImage = (id: string): ImageMetadata | null => {
  // 見つからない場合はnullを返す
  return null;
};

// Bad
const getImage = (id: string): ImageMetadata | undefined => {
  return undefined;
};
```

### 2.4 非同期処理
- `async/await`を使用（Promiseチェーンは避ける）
- エラーハンドリングは必須

```typescript
// Good
const uploadImage = async (file: File): Promise<UploadResult> => {
  try {
    const s3Result = await s3Client.upload(file);
    const metadata = await saveMetadata(s3Result);
    return { success: true, metadata };
  } catch (error) {
    logger.error('Image upload failed', error);
    throw new ImageUploadError('Failed to upload image', error);
  }
};

// Bad
const uploadImage = (file: File): Promise<UploadResult> => {
  return s3Client.upload(file)
    .then(s3Result => saveMetadata(s3Result))
    .then(metadata => ({ success: true, metadata }))
    .catch(error => {
      console.log(error);
      throw error;
    });
};
```

## 3. コメント規約

### 3.1 日本語コメント
- コード内のコメントは**日本語**で記述
- 技術用語は英語のまま使用可能

```typescript
// Good
// ユーザーIDからユーザー情報を取得する
const getUserById = async (userId: string): Promise<User> => {
  // DynamoDBから取得
  const result = await dynamoClient.get({
    TableName: USERS_TABLE,
    Key: { userId }
  });
  
  return result.Item as User;
};

// Bad
// Get user by user ID
const getUserById = async (userId: string): Promise<User> => {
  // Get from DynamoDB
  const result = await dynamoClient.get({
    TableName: USERS_TABLE,
    Key: { userId }
  });
  
  return result.Item as User;
};
```

### 3.2 JSDocコメント
- 公開API、複雑な関数にはJSDocを記述
- パラメータ、戻り値、例外を文書化

```typescript
/**
 * 画像をS3にアップロードし、メタデータをDynamoDBに保存する
 * 
 * @param file - アップロードする画像ファイル（JPEG形式のみ）
 * @param userId - アップロードするユーザーのID
 * @returns アップロード結果とメタデータ
 * @throws {ImageUploadError} ファイル形式が無効、またはアップロードに失敗した場合
 * 
 * @example
 * ```typescript
 * const result = await uploadImage(file, 'user123');
 * console.log(result.metadata.imageId);
 * ```
 */
const uploadImage = async (
  file: File,
  userId: string
): Promise<UploadResult> => {
  // 実装
};
```

### 3.3 TODOコメント
- TODO、FIXME、HACKを使用
- 担当者と日付を記載

```typescript
// TODO(yamada): 2024-12-20 - サムネイル生成の最適化
// FIXME(tanaka): メモリリークの可能性あり
// HACK: 一時的な回避策、後で修正が必要
```

## 4. エラーハンドリング

### 4.1 カスタムエラークラス
- 独自のエラークラスを定義
- エラーの種類ごとにクラスを作成

```typescript
// Good
class ImageUploadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

// 使用例
throw new ImageUploadError('Invalid file format', null, 400);
```

### 4.2 エラーログ
- 構造化ログを使用
- エラーレベルを適切に設定

```typescript
// Good
import { logger } from './logger';

try {
  await uploadImage(file);
} catch (error) {
  logger.error('Image upload failed', {
    error,
    userId,
    fileName: file.name,
    fileSize: file.size
  });
  throw new ImageUploadError('Failed to upload image', error);
}

// Bad
try {
  await uploadImage(file);
} catch (error) {
  console.log('Error:', error);
  throw error;
}
```

### 4.3 Lambda関数のエラーレスポンス
- 統一されたエラーレスポンス形式を使用

```typescript
// Good
const errorResponse = (
  statusCode: number,
  message: string,
  details?: unknown
) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify({
    error: {
      message,
      details,
      timestamp: new Date().toISOString()
    }
  })
});

// 使用例
return errorResponse(400, 'Invalid file format', { 
  supportedFormats: ['image/jpeg'] 
});
```

## 5. テスト規約

### 5.1 テストファイル命名
- テスト対象ファイルと同じ名前に`.test.ts`または`.spec.ts`を付ける
- テストファイルは対象ファイルと同じディレクトリに配置

```
src/
  services/
    image-upload.service.ts
    image-upload.service.test.ts
  utils/
    validation.ts
    validation.test.ts
```

### 5.2 テスト構造
- **Arrange-Act-Assert**パターンを使用
- テスト名は日本語で記述可能

```typescript
// Good
describe('ImageUploadService', () => {
  describe('uploadImage', () => {
    it('有効なJPEG画像をアップロードできる', async () => {
      // Arrange
      const file = createMockJpegFile();
      const userId = 'user123';
      
      // Act
      const result = await uploadImage(file, userId);
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.metadata.imageId).toBeDefined();
    });
    
    it('JPEG以外の形式はエラーを返す', async () => {
      // Arrange
      const file = createMockPngFile();
      const userId = 'user123';
      
      // Act & Assert
      await expect(uploadImage(file, userId))
        .rejects
        .toThrow(ImageUploadError);
    });
  });
});
```

### 5.3 プロパティベーステスト
- fast-checkを使用
- 最低100回実行
- テスト名にプロパティ番号を含める

```typescript
import * as fc from 'fast-check';

describe('Feature: image-management, Property 1: 有効画像アップロード保存', () => {
  it('すべての有効なJPEG画像ファイルがS3に正しく保存される', async () => {
    await fc.assert(
      fc.asyncProperty(
        validJpegFileArbitrary(),
        async (file) => {
          const result = await uploadImage(file, 'test-user');
          const s3Object = await getS3Object(result.s3Key);
          
          expect(result.success).toBe(true);
          expect(s3Object).toBeDefined();
          expect(s3Object.ContentLength).toBe(file.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### 5.4 モック
- 外部サービス（S3、DynamoDB）はモック化
- jest.mockを使用

```typescript
// Good
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-dynamodb');

const mockS3Upload = jest.fn();
const mockDynamoDbPut = jest.fn();

beforeEach(() => {
  mockS3Upload.mockResolvedValue({ Key: 'test-key' });
  mockDynamoDbPut.mockResolvedValue({});
});
```

## 6. AWS CDK規約

### 6.1 Stack構成
- 論理的な単位でStackを分割
- 環境ごとにStackを作成

```typescript
// Good
class NetworkStack extends cdk.Stack { ... }
class DatabaseStack extends cdk.Stack { ... }
class ApplicationStack extends cdk.Stack { ... }

// app.ts
const app = new cdk.App();
const env = { account: '123456789', region: 'ap-northeast-1' };

new NetworkStack(app, 'ImageManagement-Network-Dev', { env });
new DatabaseStack(app, 'ImageManagement-Database-Dev', { env });
new ApplicationStack(app, 'ImageManagement-App-Dev', { env });
```

### 6.2 リソース命名
- プロジェクト名をプレフィックスに使用
- 環境名をサフィックスに使用

```typescript
// Good
const bucket = new s3.Bucket(this, 'ImagesBucket', {
  bucketName: `image-management-images-${env}`,
  removalPolicy: cdk.RemovalPolicy.RETAIN
});

// Bad
const bucket = new s3.Bucket(this, 'Bucket', {
  bucketName: 'images'
});
```

### 6.3 環境変数
- cdk.jsonまたはコンテキストで管理
- 機密情報はSecrets Managerを使用

```typescript
// Good
const apiUrl = this.node.tryGetContext('apiUrl');
const dbSecret = secretsmanager.Secret.fromSecretNameV2(
  this,
  'DBSecret',
  'image-management/db-credentials'
);

// Bad
const apiUrl = 'https://api.example.com'; // ハードコード
const dbPassword = 'password123'; // 機密情報をハードコード
```

## 7. Git規約

### 7.1 コミットメッセージ
- 日本語で記述
- プレフィックスを使用

```
feat: 画像アップロード機能を追加
fix: タグ重複チェックのバグを修正
docs: READMEにデプロイ手順を追加
test: 画像削除のプロパティテストを追加
refactor: DynamoDBクライアントをリファクタリング
chore: 依存パッケージを更新
```

### 7.2 ブランチ命名
- feature/、fix/、hotfix/をプレフィックスに使用

```
feature/image-upload
fix/tag-duplication-bug
hotfix/security-vulnerability
```

## 8. パフォーマンス

### 8.1 Lambda関数
- コールドスタート対策
- 接続の再利用

```typescript
// Good - Lambda関数外で初期化
const s3Client = new S3Client({ region: 'ap-northeast-1' });
const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-1' });

export const handler = async (event: APIGatewayEvent) => {
  // s3Client、dynamoClientを再利用
};

// Bad - 毎回初期化
export const handler = async (event: APIGatewayEvent) => {
  const s3Client = new S3Client({ region: 'ap-northeast-1' });
  const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-1' });
};
```

### 8.2 DynamoDB
- バッチ操作を使用
- GSIを活用

```typescript
// Good - バッチ取得
const batchGet = async (imageIds: string[]) => {
  const result = await dynamoClient.batchGet({
    RequestItems: {
      [IMAGES_TABLE]: {
        Keys: imageIds.map(id => ({ imageId: id }))
      }
    }
  });
  return result.Responses[IMAGES_TABLE];
};

// Bad - 個別取得
const getImages = async (imageIds: string[]) => {
  const promises = imageIds.map(id => 
    dynamoClient.get({
      TableName: IMAGES_TABLE,
      Key: { imageId: id }
    })
  );
  return Promise.all(promises);
};
```

## 9. セキュリティ

### 9.1 入力検証
- すべての入力を検証
- ホワイトリスト方式を使用

```typescript
// Good
const validateImageFile = (file: File): void => {
  const allowedTypes = ['image/jpeg', 'image/jpg'];
  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError('Invalid file type');
  }
  
  const maxSize = 100 * 1024 * 1024; // 100MB
  if (file.size > maxSize) {
    throw new ValidationError('File size exceeds limit');
  }
};

// Bad
const validateImageFile = (file: File): void => {
  if (file.type !== 'image/png') {
    // OK（ブラックリスト方式）
  }
};
```

### 9.2 認証・認可
- すべてのAPIエンドポイントで認証チェック
- ロールベースのアクセス制御

```typescript
// Good
const checkPermission = (user: User, action: string, resource: Resource): boolean => {
  if (user.role === 'SYSTEM_ADMIN') {
    return true;
  }
  
  if (user.role === 'IMAGE_MANAGER') {
    return ['read', 'download', 'updateVisibility'].includes(action);
  }
  
  if (user.role === 'REGULAR_USER') {
    return resource.ownerId === user.userId;
  }
  
  return false;
};
```

### 9.3 機密情報
- 環境変数で管理
- ログに出力しない

```typescript
// Good
const apiKey = process.env.API_KEY;
logger.info('API request', { endpoint: '/api/images' });

// Bad
const apiKey = 'sk-1234567890abcdef';
logger.info('API request', { apiKey, endpoint: '/api/images' });
```

## 10. ドキュメント

### 10.1 README
- プロジェクト概要
- セットアップ手順
- 開発手順
- デプロイ手順

### 10.2 API仕様書
- OpenAPI（Swagger）形式で記述
- エンドポイント、パラメータ、レスポンスを文書化

### 10.3 コード内ドキュメント
- 複雑なロジックには説明コメント
- 公開APIにはJSDoc

## まとめ

このガイドラインに従うことで、コードの品質、可読性、保守性が向上します。不明な点があれば、チームで議論して決定してください。

ガイドラインは必要に応じて更新されます。