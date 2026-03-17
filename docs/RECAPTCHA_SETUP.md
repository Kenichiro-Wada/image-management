# reCAPTCHA v3 セットアップガイド

## 概要

このガイドでは、画像管理システムにGoogle reCAPTCHA v3を統合する手順を説明します。

## 1. Google reCAPTCHA v3の登録

### 1.1 Google reCAPTCHA Admin Consoleにアクセス

https://www.google.com/recaptcha/admin にアクセスしてGoogleアカウントでログイン

### 1.2 新しいサイトを登録

1. 「+」ボタンをクリック
2. 以下の情報を入力：

**ラベル:**
```
画像管理システム - 開発環境
```

**reCAPTCHAタイプ:**
- ✅ reCAPTCHA v3を選択

**ドメイン:**
```
localhost
your-dev-domain.com
your-prod-domain.com
```

**オーナー:**
- 自分のGoogleアカウントのメールアドレス

**reCAPTCHA利用条件に同意する:**
- ✅ チェック

3. 「送信」をクリック

### 1.3 Site KeyとSecret Keyを取得

登録完了後、以下の2つのキーが表示されます：

- **Site Key**: フロントエンドで使用（公開可能）
- **Secret Key**: バックエンドで使用（秘密情報）

これらのキーをメモしておいてください。

## 2. 環境変数の設定

### 2.1 フロントエンド（管理画面）

`frontend-admin/.env.development` を作成または編集：

```bash
# 既存の環境変数
VITE_API_ENDPOINT=https://your-api-gateway-url.execute-api.us-west-2.amazonaws.com/dev
VITE_COGNITO_REGION=us-west-2
VITE_COGNITO_USER_POOL_ID=us-west-2_XXXXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_CLOUDFRONT_IMAGES_URL=https://xxxxxx.cloudfront.net
VITE_CLOUDFRONT_THUMBNAILS_URL=https://yyyyyy.cloudfront.net

# reCAPTCHA Site Key（公開可能）
VITE_RECAPTCHA_SITE_KEY=6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

`frontend-admin/.env.production` も同様に設定：

```bash
# 本番環境用の設定
VITE_API_ENDPOINT=https://your-api-gateway-url.execute-api.us-west-2.amazonaws.com/prd
VITE_COGNITO_REGION=us-west-2
VITE_COGNITO_USER_POOL_ID=us-west-2_YYYYYYYYY
VITE_COGNITO_USER_POOL_CLIENT_ID=yyyyyyyyyyyyyyyyyyyyyyyyyy
VITE_CLOUDFRONT_IMAGES_URL=https://zzzzzz.cloudfront.net
VITE_CLOUDFRONT_THUMBNAILS_URL=https://wwwwww.cloudfront.net

# reCAPTCHA Site Key（本番環境用）
VITE_RECAPTCHA_SITE_KEY=6LeYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
```

### 2.2 バックエンド（Lambda）

reCAPTCHA Secret Keyは環境変数として設定します。

**開発環境:**

```bash
export RECAPTCHA_SECRET_KEY="6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

**本番環境:**

AWS Systems Manager Parameter Storeまたは Secrets Managerに保存することを推奨：

```bash
# Parameter Storeに保存
aws ssm put-parameter \
  --name "/image-management/prd/recaptcha-secret-key" \
  --value "6LeYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY" \
  --type "SecureString" \
  --region us-west-2 \
  --profile wada-sso-dev

# Secrets Managerに保存（推奨）
aws secretsmanager create-secret \
  --name "image-management/prd/recaptcha-secret" \
  --secret-string '{"secret_key":"6LeYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"}' \
  --region us-west-2 \
  --profile wada-sso-dev
```

## 3. デプロイ

### 3.1 Lambda関数のビルド

```bash
cd lambda
npm run build
cd ..
```

### 3.2 CDKデプロイ

**開発環境:**

```bash
export RECAPTCHA_SECRET_KEY="6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

npx cdk deploy InfraAuthStack AppAdminStack \
  --profile wada-sso-dev \
  --require-approval never
```

**本番環境:**

```bash
export RECAPTCHA_SECRET_KEY="6LeYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"

npx cdk deploy InfraAuthStack AppAdminStack \
  --profile wada-sso-dev \
  --context environment=prd \
  --require-approval never
```

### 3.3 フロントエンドのビルドとデプロイ

```bash
cd frontend-admin

# ビルド
npm run build

# S3にデプロイ
aws s3 sync dist/ s3://your-admin-bucket-name \
  --delete \
  --profile wada-sso-dev

# CloudFrontキャッシュ無効化
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*" \
  --profile wada-sso-dev

cd ..
```

## 4. 動作確認

### 4.1 サインアップページにアクセス

```
https://your-admin-domain.com/signup
```

### 4.2 サインアップを試す

1. メールアドレスとパスワードを入力
2. 「登録」ボタンをクリック
3. reCAPTCHAが自動的に検証される（目に見えない）
4. 確認コードがメールで送信される

### 4.3 ログで確認

**Lambda関数のログ（CloudWatch Logs）:**

```bash
aws logs tail /aws/lambda/ImageManagement-VerifyRecaptcha-dev \
  --follow \
  --profile wada-sso-dev
```

**期待されるログ出力:**

```json
{
  "success": true,
  "score": 0.9,
  "action": "signup",
  "challenge_ts": "2024-01-15T10:30:00Z",
  "hostname": "your-domain.com"
}
```

## 5. reCAPTCHAスコアの調整

### 5.1 スコアの意味

reCAPTCHA v3は0.0〜1.0のスコアを返します：

- **1.0**: 確実に人間
- **0.9〜0.7**: おそらく人間
- **0.6〜0.4**: 疑わしい
- **0.3〜0.0**: おそらくボット

### 5.2 閾値の変更

`frontend-admin/src/pages/SignUpPage.tsx` の閾値を調整：

```typescript
// スコアが低い場合は拒否（0.5以下はボットの可能性が高い）
if (verifyData.data.score < 0.5) {  // ← この値を調整
  setError('セキュリティチェックに失敗しました。しばらく時間をおいて再度お試しください。');
  return;
}
```

**推奨値:**
- **厳しい**: 0.7以上（誤検知が増える可能性）
- **標準**: 0.5以上（推奨）
- **緩い**: 0.3以上（ボットが通過する可能性）

### 5.3 スコア別の対応

スコアに応じて異なる対応をすることも可能：

```typescript
const score = verifyData.data.score;

if (score >= 0.7) {
  // 即座にサインアップ許可
} else if (score >= 0.5) {
  // サインアップ許可（監視対象）
} else if (score >= 0.3) {
  // 追加の確認（メール確認など）
} else {
  // サインアップ拒否
}
```

## 6. トラブルシューティング

### 6.1 reCAPTCHAが初期化されない

**症状:**
```
reCAPTCHAの初期化に失敗しました。ページを再読み込みしてください。
```

**原因:**
- Site Keyが正しく設定されていない
- ドメインが登録されていない

**解決策:**
1. `.env.development` の `VITE_RECAPTCHA_SITE_KEY` を確認
2. Google reCAPTCHA Admin Consoleでドメインを確認

### 6.2 reCAPTCHA検証に失敗する

**症状:**
```
reCAPTCHA検証に失敗しました
```

**原因:**
- Secret Keyが正しく設定されていない
- トークンの有効期限切れ

**解決策:**
1. Lambda関数の環境変数 `RECAPTCHA_SECRET_KEY` を確認
2. CloudWatch Logsでエラー詳細を確認

### 6.3 スコアが低すぎる

**症状:**
```
セキュリティチェックに失敗しました。しばらく時間をおいて再度お試しください。
```

**原因:**
- VPNやプロキシを使用している
- ブラウザの設定（JavaScriptブロックなど）
- 短時間に複数回試行

**解決策:**
1. VPN/プロキシを無効化
2. ブラウザのJavaScriptを有効化
3. しばらく時間をおいて再試行
4. 閾値を調整（開発環境のみ）

## 7. セキュリティのベストプラクティス

### 7.1 Secret Keyの管理

- ❌ コードにハードコードしない
- ❌ GitHubにコミットしない
- ✅ 環境変数で管理
- ✅ AWS Secrets Managerに保存（本番環境）

### 7.2 スコアのログ記録

スコアをログに記録して、ボット攻撃のパターンを分析：

```typescript
console.log('reCAPTCHA score:', score, 'action:', action, 'email:', email);
```

### 7.3 レート制限

reCAPTCHAと併用してレート制限を実装：

- 同一IPアドレスからの連続サインアップを制限
- 同一メールアドレスでの複数回試行を制限

## 8. 参考リンク

- [Google reCAPTCHA v3 公式ドキュメント](https://developers.google.com/recaptcha/docs/v3)
- [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- [react-google-recaptcha-v3](https://www.npmjs.com/package/react-google-recaptcha-v3)
