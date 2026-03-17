# Lambda Functions - Image Management System

画像管理システムのLambda関数実装です。

## 技術スタック

- **ランタイム**: Node.js 22.x LTS
- **言語**: TypeScript
- **テスト**: Jest
- **AWS SDK**: v3

## プロジェクト構造

```
lambda/
├── src/
│   ├── common/           # 共通ライブラリ
│   │   ├── dynamodb-client.ts
│   │   ├── s3-client.ts
│   │   ├── types.ts
│   │   ├── logger.ts
│   │   └── validator.ts
│   ├── middleware/       # ミドルウェア
│   │   ├── auth.ts
│   │   └── error-handler.ts
│   └── handlers/         # Lambda関数ハンドラー
├── dist/                 # ビルド出力
├── package.json
├── tsconfig.json
└── jest.config.js
```

## セットアップ

```bash
# 依存関係のインストール
cd lambda
npm install

# TypeScriptのビルド
npm run build

# テストの実行
npm test
```

## 共通ライブラリ

### DynamoDBクライアント

```typescript
import { dynamoDb } from './common/dynamodb-client';

// アイテムを取得
const item = await dynamoDb.get({
  TableName: 'ImageManagement-Images-dev',
  Key: { PK: 'IMAGE#123', SK: 'METADATA' },
});

// アイテムを保存
await dynamoDb.put({
  TableName: 'ImageManagement-Images-dev',
  Item: { PK: 'IMAGE#123', SK: 'METADATA', ...data },
});

// クエリ実行
const result = await dynamoDb.query({
  TableName: 'ImageManagement-Images-dev',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: { ':pk': 'USER#user123' },
});
```

### S3クライアント

```typescript
import { s3 } from './common/s3-client';

// オブジェクトをアップロード
await s3.putObject({
  Bucket: 'image-management-images-dev',
  Key: 'images/test.jpg',
  Body: buffer,
  ContentType: 'image/jpeg',
});

// オブジェクトを取得
const result = await s3.getObject({
  Bucket: 'image-management-images-dev',
  Key: 'images/test.jpg',
});

// 署名付きURLを生成
const url = await s3.getSignedUploadUrl({
  Bucket: 'image-management-images-dev',
  Key: 'images/test.jpg',
  ContentType: 'image/jpeg',
  ExpiresIn: 3600,
});
```

## ミドルウェア

### 認証ミドルウェア

```typescript
import { authenticate, authorize, UserRole } from './middleware/auth';

// 認証
const user = await authenticate(event);

// 認可チェック
if (!authorize(user, [UserRole.SYSTEM_ADMIN, UserRole.IMAGE_MANAGER])) {
  throw new ForbiddenError();
}
```

### エラーハンドリング

```typescript
import { withErrorHandler, successResponse, ValidationError } from './middleware/error-handler';

export const handler = withErrorHandler(async (event) => {
  // バリデーション
  if (!event.body) {
    throw new ValidationError('リクエストボディが必要です');
  }
  
  // 処理
  const result = await processRequest(event);
  
  // 成功レスポンス
  return successResponse(result);
});
```

## バリデーション

```typescript
import { Validator, validateImageFile, validateTagName } from './common/validator';

// 画像ファイルのバリデーション
validateImageFile('test.jpg', 1024 * 1024, 'image/jpeg');

// タグ名のバリデーション
validateTagName('風景');

// カスタムバリデーション
const validator = new Validator();
validator
  .validate('email', email, {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  .validate('age', age, {
    min: 0,
    max: 150,
  });

validator.throwIfInvalid();
```

## ロギング

```typescript
import { logger } from './common/logger';

// コンテキストを設定
logger.setContext({ userId: 'user123', requestId: 'req456' });

// ログ出力
logger.info('画像をアップロードしました', { imageId: 'img789' });
logger.error('エラーが発生しました', error);
```

## 環境変数

Lambda関数で使用する環境変数：

- `AWS_REGION`: AWSリージョン
- `USER_POOL_ID`: Cognito User Pool ID
- `IMAGES_TABLE_NAME`: 画像メタデータテーブル名
- `TAGS_TABLE_NAME`: タグ管理テーブル名
- `USERS_TABLE_NAME`: ユーザー情報テーブル名
- `IMAGES_BUCKET_NAME`: 画像ストレージバケット名
- `THUMBNAILS_BUCKET_NAME`: サムネイルバケット名

## テスト

```bash
# 全テストを実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジ
npm test -- --coverage
```

## ビルド

```bash
# TypeScriptをビルド
npm run build

# ビルドをクリーン
npm run clean
```

## デプロイ

Lambda関数はCDKによって自動的にデプロイされます。

```bash
# CDKでデプロイ
cd ..
npx cdk deploy ImageManagement-App-Admin-Dev
```
