# 画像管理システム (Image Management System)

AWS上で動作するサーバーレス画像管理システムです。管理者が画像をアップロード・管理し、一般公開された画像を誰でも閲覧できるWebアプリケーションを提供します。

## 特徴

- **サーバーレスアーキテクチャ**: AWS Lambda、API Gateway、DynamoDBを使用した完全サーバーレス構成
- **スケーラブル**: 自動スケーリングによる高負荷対応
- **セキュア**: AWS Cognitoによる認証・認可、ロールベースアクセス制御
- **高速配信**: CloudFront CDNによる画像配信
- **自動リサイズ**: アップロード時に3サイズのサムネイルを自動生成（150x150、400x400、800x600）
- **柔軟な検索**: タグ、キーワード、撮影日による検索・フィルタリング
- **モダンUI**: React 18 + TypeScriptによるレスポンシブデザイン
- **一括操作**: 一括ダウンロード（ZIP）、一括公開/非公開、一括タグ付け、一括削除
- **レーティング機能**: 管理者による1〜5段階の星評価
- **Like機能**: ビューアー向けの匿名いいね機能（認証不要）
- **セルフサインアップ**: reCAPTCHA v3によるボット対策付きユーザー登録
- **画像詳細ナビゲーション**: 詳細モーダルで前後の画像に移動（ボタン・矢印キー対応）
- **Likeフィルター**: 管理画面でLikeあり画像の絞り込み、画像カードにLike数表示
- **スライドショー**: 自動再生・一時停止/再開・手動ナビゲーション対応
- **URLタグ絞り込み**: タグで絞り込んだギャラリーリンクの共有
- **ビューアーソート**: 撮影日時・アップロード日時・ファイル名・タグで並び替え（昇順/降順）
- **公開状態フィルター**: 管理画面で公開/非公開の絞り込み
- **レスポンシブモーダル**: スマホ（768px以下）でフルスクリーン縦並びレイアウト
- **Exif orientation対応**: Exif情報に基づくサムネイルの自動回転
- **S3署名付きURLアップロード**: API Gatewayの10MB制限を回避する直接S3アップロード
- **セキュリティ**: axiosバージョンを1.13.5に完全固定（サプライチェーン攻撃対策）

## アーキテクチャ

### Stack構成（レイヤー別）

#### インフラレイヤー（基盤）
1. **InfraStorageStack**: S3バケット、CloudFrontディストリビューション
2. **InfraDatabaseStack**: DynamoDBテーブル
3. **InfraAuthStack**: Cognito User Pool、ユーザーグループ

#### アプリケーションレイヤー
4. **AppAdminStack**: 管理画面用API Gateway、Lambda関数
5. **AppViewerStack**: ビューアー用API Gateway、Lambda関数

### 技術スタック

| コンポーネント | 技術 |
|------------|------|
| インフラ | AWS CDK v2.1109.0（TypeScript） |
| バックエンド | Node.js 24.x LTS、TypeScript |
| フロントエンド | React 18、TypeScript、Vite |
| テスト | Jest、fast-check、Playwright |
| 画像処理 | Sharp.js |
| 認証 | AWS Cognito、AWS Amplify |

## 主要機能

### 管理画面
- 複数ファイル・フォルダ単位での画像アップロード（JPEG形式のみ、S3署名付きURL方式）
- タグ管理（オートコンプリート付き）
- 3段階のユーザー権限管理（システム管理者・画像管理者・一般ユーザー）
- 画像ダウンロード（単一・一括ZIP、署名付きURL方式、50枚ずつバッチ分割）
- 一括公開/非公開
- 一括タグ付け
- 1〜5段階の星評価（平均表示・絞り込み対応）
- Likeフィルター（Likeあり画像の絞り込み、Like数バッジ表示）
- 公開状態フィルター（すべて/公開のみ/非公開のみ）
- 画像詳細モーダルの前後ナビゲーション（◀▶ボタン・矢印キー・位置インジケーター）
- ページネーション・一括削除
- ログアウト機能
- セルフサインアップ（reCAPTCHA v3統合）

### ビューアーギャラリー
- 無限スクロール対応の公開ギャラリー
- 画像拡大表示モーダル（前後ナビゲーション付き）
- 並び替え機能（撮影日時・アップロード日時・ファイル名・タグ、昇順/降順）
- キーワード・タグ・撮影日による検索
- スライドショー（自動再生・一時停止/再開）
- Like機能（匿名、localStorage管理）
- URLパラメータによるタグ絞り込み（`?tag=風景&tag=夏`）
- レスポンシブモーダル（スマホでフルスクリーン縦並びレイアウト）


## クイックスタート

### 前提条件

- Node.js 24.x LTS
- AWS CLI（設定済み）
- AWS CDK CLI（`npm install -g aws-cdk`）
- AWSアカウントとIAM権限

### インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd image-management-system

# 依存関係のインストール
npm install

# Lambda関数の依存関係
cd lambda && npm install && cd ..

# フロントエンド（管理画面）の依存関係
cd frontend-admin && npm install && cd ..

# フロントエンド（ビューアー）の依存関係
cd frontend-viewer && npm install && cd ..

# TypeScriptのビルド
npm run build
```

### 初回デプロイ

```bash
# CDK Bootstrap（初回のみ）
npx cdk bootstrap

# 全スタックのデプロイ
npx cdk deploy --all --require-approval never
```

詳細なデプロイ手順は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照してください。

## 開発コマンド

### CDK関連

```bash
# TypeScriptのビルド
npm run build

# ファイル変更を監視してビルド
npm run watch

# CloudFormationテンプレートの生成（dev環境）
npx cdk synth

# CloudFormationテンプレートの生成（prd環境）
npx cdk synth -c environment=prd

# デプロイ前の差分確認
npx cdk diff

# AWSへのデプロイ（dev環境、全Stack）
npx cdk deploy --all

# AWSへのデプロイ（prd環境、全Stack）
npx cdk deploy --all -c environment=prd

# 特定のStackのみデプロイ
npx cdk deploy ImageManagement-App-Admin-Dev

# インフラレイヤーのみデプロイ
npx cdk deploy ImageManagement-Infra-Storage-Dev ImageManagement-Infra-Database-Dev ImageManagement-Infra-Auth-Dev

# アプリケーションレイヤーのみデプロイ
npx cdk deploy ImageManagement-App-Admin-Dev ImageManagement-App-Viewer-Dev

# スタックの削除
npx cdk destroy --all
```

### Lambdaビルド・デプロイ

```bash
cd lambda && npm run build
npx cdk deploy ImageManagement-App-Admin-Dev --require-approval never
npx cdk deploy ImageManagement-App-Viewer-Dev --require-approval never
```

### フロントエンドビルド・デプロイ

```bash
# 管理画面
cd frontend-admin && npm run build
aws s3 sync dist/ s3://<admin-bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <admin-distribution-id> --paths "/*"

# ビューアー
cd frontend-viewer && npm run build
aws s3 sync dist/ s3://<viewer-bucket-name> --delete
aws cloudfront create-invalidation --distribution-id <viewer-distribution-id> --paths "/*"
```

### 環境設定

プロジェクトは複数の環境（dev/prd）をサポートしています。

| 変数 | 説明 | デフォルト |
|------|------|---------|
| `environment` | デプロイ環境 | `dev` |
| `region` | AWSリージョン | `ap-northeast-1` |

```bash
# prd環境にデプロイ
npx cdk deploy --all -c environment=prd

# 異なるリージョンにデプロイ
npx cdk deploy --all -c region=us-west-2
```

#### Stack名の規則

**インフラレイヤー:**
- dev: `ImageManagement-Infra-Storage-Dev`、`ImageManagement-Infra-Database-Dev`、`ImageManagement-Infra-Auth-Dev`
- prd: `ImageManagement-Infra-Storage-Prd`、`ImageManagement-Infra-Database-Prd`、`ImageManagement-Infra-Auth-Prd`

**アプリケーションレイヤー:**
- dev: `ImageManagement-App-Admin-Dev`、`ImageManagement-App-Viewer-Dev`
- prd: `ImageManagement-App-Admin-Prd`、`ImageManagement-App-Viewer-Prd`

#### タグ付け

すべてのリソースには以下のタグが自動的に付与されます：
- `Project`: ImageManagement
- `Environment`: dev または prd
- `ManagedBy`: CDK

### テスト

```bash
# バックエンドのユニットテスト
cd lambda && npm test

# フロントエンドのテスト
cd frontend-admin && npm test
cd frontend-viewer && npm test

# E2Eテスト
cd e2e && npm test
```

## プロジェクト構造

```
.
├── bin/                          # CDKアプリケーションのエントリーポイント
│   └── image-management.ts
├── lib/                          # CDK Stackの定義
│   ├── infra-storage-stack.ts    # ストレージ（S3、CloudFront）
│   ├── infra-database-stack.ts   # データベース（DynamoDB）
│   ├── infra-auth-stack.ts       # 認証（Cognito）
│   ├── app-admin-stack.ts        # 管理画面API + Lambda
│   └── app-viewer-stack.ts       # ビューアーAPI + Lambda
├── lambda/                       # Lambda関数ソース
│   └── src/handlers/             # ハンドラー実装
├── frontend-admin/               # 管理画面Reactアプリ（Vite）
├── frontend-viewer/              # ビューアーReactアプリ（Vite）
├── e2e/                          # E2Eテスト（Playwright）
├── docs/                         # ドキュメント
├── scripts/                      # ユーティリティスクリプト
├── .kiro/specs/                  # 機能仕様書
├── .github/                      # CI/CDワークフロー
├── cdk.json                      # CDK設定ファイル
└── README.md
```


## AWSリソース

### InfraStorageStack
- **Amazon S3**: オリジナル画像（バージョニング有効）、サムネイル、管理画面フロントエンド、ビューアーフロントエンド
- **Amazon CloudFront**: 4つのディストリビューション（管理画面、ビューアー、画像、サムネイル）、OAI使用、TLS 1.2+、IPv6、HTTP/2・HTTP/3対応
- **S3ライフサイクルルール**: `tmp/`プレフィックスの一時ファイルを1日後に自動削除

### InfraDatabaseStack
- **Amazon DynamoDB**: 画像メタデータテーブル（GSI1: ユーザー別一覧、GSI2: 公開画像一覧）、タグテーブル、ユーザーテーブル
- オンデマンドキャパシティモード

### InfraAuthStack
- **Amazon Cognito**: User Pool（セルフサインアップ有効、メール検証、パスワードポリシー）
- ユーザーグループ: System_Admin、Image_Manager、Regular_User
- Post Confirmation Trigger（Regular_Userグループ自動追加）
- reCAPTCHA v3統合（サインアップ時）

### AppAdminStack
- **API Gateway**: 管理画面用REST API（Cognito Authorizer、CORS、バイナリメディアタイプ対応）
- **Lambda関数**（Node.js 24.x）:
  - 画像アップロード、一覧、削除、一括削除
  - タグ追加、削除、オートコンプリート、一括タグ付け
  - 画像ダウンロード、一括ダウンロード（ZIP）
  - 公開状態変更、一括公開状態変更
  - レーティング（追加/更新、取得）
  - 認証（ログイン、検証、ユーザー情報、reCAPTCHA検証）

### AppViewerStack
- **API Gateway**: ビューアー用REST API（認証不要、CORS対応）
- **Lambda関数**（Node.js 24.x）:
  - 公開画像一覧（カーソルベースページネーション）
  - 画像検索（キーワード、タグ、撮影日）
  - Like/Unlike

## ユーザー権限

| ロール | 権限 |
|--------|------|
| System_Admin | すべての操作が可能、全ユーザーの画像にアクセス |
| Image_Manager | 全画像の閲覧・ダウンロード・公開状態変更が可能 |
| Regular_User | 自分の画像のみ操作可能（アップロード・編集・削除・ダウンロード） |

## デプロイ順序

Stack間の依存関係はCDKが自動的に解決します：

1. **インフラレイヤー**（並行デプロイ可能）
   - InfraStorageStack、InfraDatabaseStack、InfraAuthStack

2. **アプリケーションレイヤー**（インフラレイヤー完了後）
   - AppAdminStack（Storage、Database、Authに依存）
   - AppViewerStack（Storage、Databaseに依存）

## ドキュメント

### 技術ドキュメント
- [API仕様書](docs/API.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [デプロイ手順](docs/DEPLOYMENT.md)
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [reCAPTCHAセットアップ](docs/RECAPTCHA_SETUP.md)
- [DynamoDBスケーリング戦略](docs/dynamodb-scaling-strategy.md)

### ユーザーマニュアル
- [管理者向けマニュアル](docs/ADMIN_MANUAL.md)
- [ビューアー向けマニュアル](docs/VIEWER_MANUAL.md)

### CI/CD

GitHub Actionsワークフロー:
- `backend-test.yml`: バックエンドのユニットテスト
- `frontend-test.yml`: フロントエンドのビルドとテスト
- `e2e-test.yml`: E2Eテスト
- `cdk-deploy.yml`: インフラとアプリケーションのデプロイ

## ライセンス

このプロジェクトは、MITライセンスの下で公開されています。
