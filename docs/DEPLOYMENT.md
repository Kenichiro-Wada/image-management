# デプロイ手順書

## 前提条件

- AWS CLIがインストールされていること
- AWS認証情報が設定されていること
- Node.js 22.x以上がインストールされていること
- AWS CDKがインストールされていること

## 環境変数の設定

### 開発環境（dev）

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-northeast-1
export ENVIRONMENT=dev
```

### 本番環境（prd）

```bash
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=ap-northeast-1
export ENVIRONMENT=prd
```

## 初回デプロイ

### 1. 依存関係のインストール

```bash
# ルートディレクトリ
npm install

# Lambda関数
cd lambda
npm install
cd ..

# フロントエンド（管理画面）
cd frontend-admin
npm install
cd ..

# フロントエンド（ビューアー）
cd frontend-viewer
npm install
cd ..
```

### 2. CDK Bootstrap

初回のみ実行が必要です。

```bash
npx cdk bootstrap aws://${AWS_ACCOUNT_ID}/${AWS_REGION}
```

### 3. インフラレイヤーのデプロイ

```bash
# ストレージスタック
npx cdk deploy InfraStorageStack --require-approval never

# データベーススタック
npx cdk deploy InfraDatabaseStack --require-approval never

# 認証スタック
npx cdk deploy InfraAuthStack --require-approval never
```

### 4. アプリケーションレイヤーのデプロイ

```bash
# 管理画面スタック
npx cdk deploy AppAdminStack --require-approval never

# ビューアースタック
npx cdk deploy AppViewerStack --require-approval never
```

### 5. フロントエンドのビルドとデプロイ

#### 管理画面

```bash
cd frontend-admin

# ビルド
npm run build

# S3にデプロイ
aws s3 sync dist/ s3://image-management-admin-frontend-${ENVIRONMENT} --delete

# CloudFrontキャッシュ無効化
aws cloudfront create-invalidation \
  --distribution-id ${ADMIN_DISTRIBUTION_ID} \
  --paths "/*"

cd ..
```

#### ビューアー

```bash
cd frontend-viewer

# ビルド
npm run build

# S3にデプロイ
aws s3 sync dist/ s3://image-management-viewer-frontend-${ENVIRONMENT} --delete

# CloudFrontキャッシュ無効化
aws cloudfront create-invalidation \
  --distribution-id ${VIEWER_DISTRIBUTION_ID} \
  --paths "/*"

cd ..
```

## 更新デプロイ

### バックエンドの更新

```bash
# Lambda関数のビルド
cd lambda
npm run build
cd ..

# スタックの更新
npx cdk deploy AppAdminStack AppViewerStack --require-approval never
```

### フロントエンドの更新

```bash
# 管理画面
cd frontend-admin
npm run build
aws s3 sync dist/ s3://image-management-admin-frontend-${ENVIRONMENT} --delete
aws cloudfront create-invalidation --distribution-id ${ADMIN_DISTRIBUTION_ID} --paths "/*"
cd ..

# ビューアー
cd frontend-viewer
npm run build
aws s3 sync dist/ s3://image-management-viewer-frontend-${ENVIRONMENT} --delete
aws cloudfront create-invalidation --distribution-id ${VIEWER_DISTRIBUTION_ID} --paths "/*"
cd ..
```

## CI/CDパイプライン

GitHub Actionsを使用した自動デプロイが設定されています。

### 必要なシークレット

GitHub Repositoryの Settings > Secrets and variables > Actions で以下を設定：

- `AWS_ACCESS_KEY_ID`: AWSアクセスキーID
- `AWS_SECRET_ACCESS_KEY`: AWSシークレットアクセスキー
- `ADMIN_BUCKET_NAME`: 管理画面フロントエンドのS3バケット名
- `ADMIN_DISTRIBUTION_ID`: 管理画面のCloudFront Distribution ID
- `VIEWER_BUCKET_NAME`: ビューアーフロントエンドのS3バケット名
- `VIEWER_DISTRIBUTION_ID`: ビューアーのCloudFront Distribution ID
- `E2E_BASE_URL`: E2EテストのベースURL

### ワークフロー

1. **Backend Tests** (`backend-test.yml`)
   - Lambda関数のユニットテスト実行
   - プッシュ時に自動実行

2. **Frontend Tests** (`frontend-test.yml`)
   - フロントエンドのビルドとテスト
   - プッシュ時に自動実行

3. **E2E Tests** (`e2e-test.yml`)
   - E2Eテストの実行
   - プッシュ時と定期実行（毎日午前3時）

4. **CDK Deploy** (`cdk-deploy.yml`)
   - インフラとアプリケーションのデプロイ
   - mainブランチへのプッシュ時に自動実行
   - 手動実行も可能

## ロールバック

### CDKスタックのロールバック

```bash
# 特定のスタックをロールバック
aws cloudformation rollback-stack --stack-name AppAdminStack

# または、前のバージョンを再デプロイ
git checkout <previous-commit>
npx cdk deploy AppAdminStack --require-approval never
```

### フロントエンドのロールバック

```bash
# S3バージョニングを使用してロールバック
aws s3api list-object-versions \
  --bucket image-management-admin-frontend-${ENVIRONMENT} \
  --prefix index.html

# 特定のバージョンを復元
aws s3api copy-object \
  --bucket image-management-admin-frontend-${ENVIRONMENT} \
  --copy-source image-management-admin-frontend-${ENVIRONMENT}/index.html?versionId=${VERSION_ID} \
  --key index.html
```

## トラブルシューティング

### デプロイが失敗する

1. AWS認証情報を確認
2. CDK Bootstrapが実行されているか確認
3. スタックの依存関係を確認（インフラレイヤー → アプリケーションレイヤー）

### Lambda関数が動作しない

1. CloudWatch Logsでエラーを確認
2. 環境変数が正しく設定されているか確認
3. IAMロールの権限を確認

### フロントエンドが表示されない

1. S3バケットにファイルがアップロードされているか確認
2. CloudFrontのキャッシュを無効化
3. ブラウザのキャッシュをクリア

## モニタリング

### CloudWatch Logs

```bash
# Lambda関数のログを確認
aws logs tail /aws/lambda/image-upload --follow

# API Gatewayのログを確認
aws logs tail /aws/apigateway/admin-api --follow
```

### CloudWatch Metrics

- Lambda関数の実行時間、エラー率
- API Gatewayのリクエスト数、レイテンシ
- DynamoDBの読み書き容量
- S3のリクエスト数

## バックアップ

### DynamoDBのバックアップ

```bash
# オンデマンドバックアップ
aws dynamodb create-backup \
  --table-name ImageManagementImagesTable \
  --backup-name images-backup-$(date +%Y%m%d)
```

### S3のバックアップ

S3バージョニングが有効になっているため、自動的にバックアップされます。

## セキュリティ

- 全てのAPI通信はHTTPS
- Cognito認証トークンの検証
- ロール別アクセス制御
- S3バケットのアクセス制御
- CloudFrontでのWAF設定（推奨）
