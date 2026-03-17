# トラブルシューティングガイド

## 目次

1. [デプロイ関連](#デプロイ関連)
2. [バックエンド関連](#バックエンド関連)
3. [フロントエンド関連](#フロントエンド関連)
4. [認証関連](#認証関連)
5. [画像アップロード関連](#画像アップロード関連)
6. [パフォーマンス関連](#パフォーマンス関連)
7. [監視・ログ](#監視ログ)

## デプロイ関連

### CDKデプロイが失敗する

#### 症状
```
Error: Need to perform AWS calls for account XXX, but no credentials found
```

#### 原因
AWS認証情報が設定されていない

#### 解決方法
```bash
# AWS CLIの設定
aws configure

# または環境変数で設定
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=ap-northeast-1
```

---

#### 症状
```
Error: This stack uses assets, so the toolkit stack must be deployed to the environment
```

#### 原因
CDK Bootstrapが実行されていない

#### 解決方法
```bash
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

---

#### 症状
```
Error: Stack XXX is in UPDATE_ROLLBACK_FAILED state
```

#### 原因
前回のデプロイが失敗し、スタックがロールバック失敗状態

#### 解決方法
```bash
# スタックを削除して再デプロイ
npx cdk destroy StackName
npx cdk deploy StackName
```

---

### Lambda関数のデプロイが失敗する

#### 症状
```
Error: Lambda function size exceeds limit
```

#### 原因
Lambda関数のパッケージサイズが大きすぎる

#### 解決方法
```bash
# node_modulesを削除して再インストール
cd lambda
rm -rf node_modules
npm install --production
npm run build
cd ..
npx cdk deploy
```

---

### CloudFormationスタックが削除できない

#### 症状
```
Error: S3 bucket is not empty
```

#### 原因
S3バケットにファイルが残っている

#### 解決方法
```bash
# S3バケットを空にする
aws s3 rm s3://bucket-name --recursive

# スタックを削除
npx cdk destroy StackName
```

## バックエンド関連

### Lambda関数がタイムアウトする

#### 症状
CloudWatch Logsに `Task timed out after 30.00 seconds` と表示される

#### 原因
- 処理時間が長すぎる
- DynamoDBやS3へのアクセスが遅い

#### 解決方法
1. Lambda関数のタイムアウト設定を増やす（CDKで設定）
2. 処理を最適化する
3. DynamoDBのキャパシティを確認

---

### Lambda関数がメモリ不足エラー

#### 症状
CloudWatch Logsに `Process exited before completing request` と表示される

#### 原因
Lambda関数のメモリ設定が不足

#### 解決方法
CDKでLambda関数のメモリ設定を増やす：
```typescript
const handler = new lambda.Function(this, 'Handler', {
  memorySize: 1024, // 512 → 1024に増やす
  // ...
});
```

---

### DynamoDBのスロットリングエラー

#### 症状
```
ProvisionedThroughputExceededException
```

#### 原因
DynamoDBの読み書き容量を超えている

#### 解決方法
1. オンデマンドモードを使用（推奨）
2. プロビジョニングモードの場合、キャパシティを増やす
3. バッチ処理を使用して、リクエスト数を減らす

---

### S3へのアップロードが失敗する

#### 症状
```
AccessDenied: Access Denied
```

#### 原因
Lambda関数のIAMロールにS3への書き込み権限がない

#### 解決方法
CDKでIAMロールに権限を追加：
```typescript
bucket.grantReadWrite(lambdaFunction);
```

## フロントエンド関連

### フロントエンドが表示されない

#### 症状
ブラウザで404エラーが表示される

#### 原因
- S3バケットにファイルがアップロードされていない
- CloudFrontのキャッシュが古い

#### 解決方法
```bash
# フロントエンドをビルドしてデプロイ
cd frontend-admin
npm run build
aws s3 sync dist/ s3://bucket-name --delete

# CloudFrontのキャッシュを無効化
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION-ID \
  --paths "/*"
```

---

### APIリクエストが失敗する

#### 症状
ブラウザのコンソールに `CORS error` と表示される

#### 原因
API GatewayのCORS設定が正しくない

#### 解決方法
CDKでCORS設定を確認：
```typescript
const api = new apigateway.RestApi(this, 'Api', {
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
});
```

---

### 環境変数が読み込まれない

#### 症状
フロントエンドでAPIエンドポイントが `undefined` になる

#### 原因
`.env`ファイルが正しく設定されていない

#### 解決方法
```bash
# .env.developmentファイルを作成
cd frontend-admin
cat > .env.development << EOF
VITE_API_URL=https://api-dev.example.com
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_XXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXX
EOF

# 開発サーバーを再起動
npm run dev
```

## 認証関連

### ログインできない

#### 症状
```
NotAuthorizedException: Incorrect username or password
```

#### 原因
- ユーザー名またはパスワードが間違っている
- ユーザーが存在しない

#### 解決方法
1. Cognito User Poolでユーザーを確認
2. パスワードをリセット
3. ユーザーが存在しない場合は、新規作成

```bash
# ユーザーの作成
aws cognito-idp admin-create-user \
  --user-pool-id USER-POOL-ID \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com \
  --temporary-password TempPassword123!
```

---

### トークンが無効になる

#### 症状
```
UnauthorizedException: The incoming token has expired
```

#### 原因
JWTトークンの有効期限が切れている

#### 解決方法
1. リフレッシュトークンを使用して、新しいアクセストークンを取得
2. ログアウトして再ログイン

---

### 権限エラーが表示される

#### 症状
```
ForbiddenException: User is not authorized to perform this action
```

#### 原因
ユーザーの権限が不足している

#### 解決方法
Cognito User Poolでユーザーグループを確認：
```bash
# ユーザーのグループを確認
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id USER-POOL-ID \
  --username user@example.com

# ユーザーをグループに追加
aws cognito-idp admin-add-user-to-group \
  --user-pool-id USER-POOL-ID \
  --username user@example.com \
  --group-name System_Admin
```

## 画像アップロード関連

### アップロードが失敗する

#### 症状
```
Error: File format not supported
```

#### 原因
JPEG形式以外のファイルをアップロードしようとしている

#### 解決方法
JPEG形式（.jpg、.jpeg）のファイルのみアップロード可能です。他の形式の場合は、画像編集ソフトでJPEGに変換してください。

---

#### 症状
```
Error: File size exceeds limit
```

#### 原因
ファイルサイズが100MBを超えている

#### 解決方法
画像編集ソフトでファイルサイズを圧縮してください。

---

### サムネイルが生成されない

#### 症状
画像一覧でサムネイルが表示されない

#### 原因
- Lambda関数（リサイズ）がエラーになっている
- S3イベントトリガーが設定されていない

#### 解決方法
1. CloudWatch Logsでエラーを確認
2. S3バケットのイベント通知設定を確認
3. Lambda関数を手動で実行してテスト

```bash
# Lambda関数のログを確認
aws logs tail /aws/lambda/image-resize --follow
```

---

### EXIF情報が抽出されない

#### 症状
撮影日時やカメラ情報が表示されない

#### 原因
画像にEXIF情報が含まれていない

#### 解決方法
EXIF情報が含まれていない画像の場合、メタデータは空になります。これは正常な動作です。

## パフォーマンス関連

### 画像の読み込みが遅い

#### 症状
ギャラリー表示で画像の読み込みに時間がかかる

#### 原因
- CloudFrontのキャッシュが効いていない
- ネットワーク速度が遅い

#### 解決方法
1. CloudFrontのキャッシュ設定を確認
2. サムネイルサイズを最適化
3. 画像の圧縮率を調整

---

### API レスポンスが遅い

#### 症状
画像一覧の取得に時間がかかる

#### 原因
- DynamoDBのクエリが最適化されていない
- Lambda関数のコールドスタート

#### 解決方法
1. DynamoDBのGSIを活用
2. Lambda関数のメモリを増やす
3. Lambda関数のプロビジョニング同時実行数を設定

---

### 無限スクロールが動作しない

#### 症状
スクロールしても次の画像が読み込まれない

#### 原因
- JavaScriptエラーが発生している
- APIリクエストが失敗している

#### 解決方法
1. ブラウザのコンソールでエラーを確認
2. ネットワークタブでAPIリクエストを確認
3. ページを再読み込み

## 監視・ログ

### CloudWatch Logsの確認方法

```bash
# Lambda関数のログを確認
aws logs tail /aws/lambda/function-name --follow

# 特定の時間範囲のログを確認
aws logs tail /aws/lambda/function-name \
  --since 1h \
  --format short

# エラーログのみを確認
aws logs tail /aws/lambda/function-name \
  --filter-pattern "ERROR"
```

---

### CloudWatch Metricsの確認方法

```bash
# Lambda関数のメトリクスを確認
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=function-name \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

---

### X-Rayトレースの確認

AWS X-Rayを有効にすると、リクエストのトレースを確認できます：

1. AWS Management Consoleにログイン
2. X-Rayサービスを開く
3. トレースマップでリクエストフローを確認
4. 個別のトレースで詳細を確認

---

### アラートの設定

CloudWatch Alarmsで以下のメトリクスを監視することを推奨します：

- Lambda関数のエラー率
- Lambda関数の実行時間
- API Gatewayの5xxエラー
- DynamoDBのスロットリング
- S3のアクセスエラー

```bash
# Lambda関数のエラー率アラートを作成
aws cloudwatch put-metric-alarm \
  --alarm-name lambda-error-rate \
  --alarm-description "Lambda function error rate" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

## よくある質問

### Q: デプロイ後、すぐに動作しない

A: CloudFrontのキャッシュが原因の可能性があります。キャッシュの無効化を実行してください。

### Q: コストが予想より高い

A: 以下を確認してください：
- CloudFrontのデータ転送量
- Lambda関数の実行回数と実行時間
- DynamoDBの読み書き容量
- S3のストレージ使用量

### Q: バックアップはどうすればいい？

A: 以下の方法でバックアップできます：
- DynamoDB: オンデマンドバックアップ、ポイントインタイムリカバリ
- S3: バージョニング、クロスリージョンレプリケーション

### Q: 本番環境へのデプロイ前に確認すべきことは？

A: 以下を確認してください：
- すべてのテストが通過していること
- 環境変数が正しく設定されていること
- バックアップが設定されていること
- 監視・アラートが設定されていること
- ロールバック手順が準備されていること

## お問い合わせ

問題が解決しない場合は、以下の情報を添えてシステム管理者にお問い合わせください：

- エラーメッセージ
- 発生日時
- 操作手順
- ブラウザ情報（フロントエンドの場合）
- CloudWatch Logsのスクリーンショット
