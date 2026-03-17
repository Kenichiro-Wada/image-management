# 設計書

## 概要

AWS上で動作するサーバーレス画像管理システムの設計書です。管理者が画像をアップロード・管理し、一般公開された画像を誰でも閲覧できるWebアプリケーションを構築します。

### 主要機能
- 複数ファイル・フォルダ単位での画像アップロード
- タグ付けによる画像分類
- 3段階のユーザー権限管理（システム管理者・画像管理者・一般ユーザー）
- 画像ダウンロード機能（単一・一括）
- 無限スクロール対応の公開ギャラリー
- 画像拡大表示・スライドショー機能
- 管理画面でのページネーション・一括操作（削除・ダウンロード・公開/非公開）

## アーキテクチャ

### システム構成図

```mermaid
graph TB
    subgraph "フロントエンド"
        A[React Webアプリ]
        B[管理画面<br/>Admin Screen]
        C[公開画面<br/>Viewer Screen]
    end
    
    subgraph "AWS CloudFront"
        D[CDN配信]
    end
    
    subgraph "AWS S3"
        E[静的ホスティング<br/>フロントエンド]
        F[画像ストレージ<br/>オリジナル画像]
        G[サムネイル画像]
    end
    
    subgraph "AWS API Gateway"
        H[REST API]
    end
    
    subgraph "AWS Lambda"
        I[画像アップロード処理]
        J[メタデータ管理]
        K[認証・認可]
        L[画像リサイズ処理]
    end
    
    subgraph "AWS DynamoDB"
        M[画像メタデータ]
        N[ユーザー情報]
    end
    
    subgraph "AWS Cognito"
        O[ユーザー認証]
    end
    
    A --> D
    D --> E
    B --> H
    C --> H
    H --> I
    H --> J
    H --> K
    I --> F
    I --> L
    L --> G
    J --> M
    K --> O
    K --> N
    F --> D
    G --> D
```

### サーバーレス構成の利点
- **自動スケーリング**: トラフィックに応じて自動的にスケール
- **コスト効率**: 使用した分だけの課金
- **運用負荷軽減**: サーバー管理不要
- **高可用性**: AWSの管理サービスによる高い可用性

## コンポーネントと インターフェース

### フロントエンド コンポーネント

#### 1. 管理画面（Admin Screen）
```typescript
// 主要コンポーネント
interface AdminScreenComponents {
  LoginForm: React.FC;           // ログイン画面
  SignUpForm: React.FC;          // サインアップ画面（Regular_User用、name入力フィールド付き）
  ImageUpload: React.FC;         // 画像アップロード
  ImageList: React.FC;           // 画像一覧（ページネーション）
  ImageEditor: React.FC;         // 画像編集（タグ付け）
  BulkActions: React.FC;         // 一括操作（削除・ダウンロード・公開/非公開）
  LogoutButton: React.FC;        // ログアウトボタン
}

// 画像アップロード機能
interface ImageUploadProps {
  onMultipleUpload: (files: FileList) => Promise<void>;
  onFolderUpload: (files: FileList) => Promise<void>;
  supportedFormats: ['image/jpeg', 'image/jpg'];  // JPEG形式のみ
  maxFileSize: number;
}
```

#### 2. 公開画面（Viewer Screen）
```typescript
// 主要コンポーネント
interface ViewerScreenComponents {
  ImageGallery: React.FC;        // 画像ギャラリー（無限スクロール）
  ImageModal: React.FC;          // 画像拡大表示
  SearchFilter: React.FC;        // 検索・フィルター
  Slideshow: React.FC;           // スライドショー
}

// 無限スクロール機能
interface InfiniteScrollProps {
  loadMore: () => Promise<Image[]>;
  hasMore: boolean;
  loading: boolean;
  pageSize: number;
}
```

#### 2.1 URLパラメータによるタグ絞り込み（Viewer Screen）
ビューアー画面のURLにクエリパラメータ`tag`を指定することで、特定のタグで絞り込んだ状態でギャラリーを表示できる。

##### URL形式
```
https://{viewer-domain}/?tag={tagName}
```

##### 仕様
- URLパラメータ`tag`が指定されている場合、ページ読み込み時に自動的にそのタグでフィルタリングされた状態で表示
- SearchFilterコンポーネントのタグフィルターにも反映（UIと同期）
- タグが存在しない場合は結果0件として表示（エラーにはしない）
- ユーザーがUI上でフィルターを変更した場合、URLパラメータも連動して更新（ブラウザの履歴に残る）
- 複数タグの指定: `?tag=風景&tag=夏` のように複数指定可能（AND条件）

##### 実装方針
- `useSearchParams`（React Router）を使用してURLパラメータを読み書き
- ページ初期化時にURLパラメータからタグを取得し、APIリクエストの`tags`パラメータに渡す
- フィルター変更時に`setSearchParams`でURLを更新（`pushState`でブラウザ履歴に追加）

```typescript
// GalleryPage.tsx での使用例
const [searchParams, setSearchParams] = useSearchParams();
const initialTags = searchParams.getAll('tag');

// 初期表示時にタグフィルターを適用
useEffect(() => {
  if (initialTags.length > 0) {
    setSelectedTags(initialTags);
    loadImages({ tags: initialTags });
  }
}, []);

// フィルター変更時にURLも更新
const handleTagChange = (tags: string[]) => {
  setSelectedTags(tags);
  const params = new URLSearchParams();
  tags.forEach(tag => params.append('tag', tag));
  setSearchParams(params);
};
```

##### ユースケース
- 管理者が特定タグの画像を共有したい場合にURLを配布
- SNSやメールでタグ付きギャラリーリンクを共有

### バックエンド API

#### 1. 画像管理 API
```typescript
// REST API エンドポイント
interface ImageAPI {
  // 画像アップロード
  'POST /api/images/upload': {
    body: FormData;
    response: UploadResponse;
  };
  
  // 画像一覧取得（管理画面用）
  'GET /api/images/admin': {
    query: {
      page: number;
      limit: number;
      userId?: string;
    };
    response: PaginatedImageResponse;
  };
  
  // 画像一覧取得（公開画面用）
  'GET /api/images/public': {
    query: {
      cursor?: string;
      limit: number;
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
    };
    response: InfiniteScrollResponse;
  };
  
  // 画像削除
  'DELETE /api/images/:id': {
    response: DeleteResponse;
  };
  
  // 一括削除
  'DELETE /api/images/bulk': {
    body: { imageIds: string[] };
    response: BulkDeleteResponse;
  };
  
  // 画像ダウンロード
  'GET /api/images/:id/download': {
    response: Blob;
  };
  
  // 一括ダウンロード（S3署名付きURL方式）
  'POST /api/images/download/bulk': {
    body: { imageIds: string[] };
    response: { downloadUrl: string }; // S3署名付きURL
  };
  
  // 公開状態変更
  'PATCH /api/images/:id/visibility': {
    body: { isPublic: boolean };
    response: UpdateResponse;
  };
  
  // 一括公開状態変更
  'PATCH /api/images/visibility/bulk': {
    body: { imageIds: string[]; isPublic: boolean };
    response: BulkUpdateResponse;
  };
}
```

#### 2. 認証 API
```typescript
interface AuthAPI {
  // ログイン
  'POST /api/auth/login': {
    body: LoginRequest;
    response: AuthResponse;
  };
  
  // トークン検証
  'GET /api/auth/verify': {
    headers: { Authorization: string };
    response: UserInfo;
  };
  
  // reCAPTCHA検証（サインアップ時）
  'POST /api/admin/auth/verify-recaptcha': {
    body: {
      token: string;
      action: string;
    };
    response: {
      success: boolean;
      score: number;
      action: string;
      details?: {
        hostname: string;
        challenge_ts: string;
      };
    };
  };
  
  // セルフサインアップ（Cognitoが処理）
  // フロントエンドからAWS Amplifyを使用して直接Cognitoにリクエスト
}
```

### AWS Lambda 関数

#### 1. 画像アップロード処理
```typescript
// Lambda関数: imageUploadHandler
interface ImageUploadHandler {
  event: APIGatewayEvent;
  context: Context;
  
  // 処理フロー
  steps: [
    'ファイル検証',
    'S3アップロード',
    'サムネイル生成',
    'メタデータ抽出',
    'DynamoDB保存'
  ];
}
```

#### 2. 画像リサイズ処理
```typescript
// Lambda関数: imageResizeHandler
interface ImageResizeHandler {
  trigger: S3Event;
  
  // サムネイルサイズ
  thumbnailSizes: {
    small: { width: 150, height: 150 };
    medium: { width: 400, height: 400 };
    large: { width: 800, height: 600 };
  };
}
```

## データモデル

### DynamoDB テーブル設計

#### 1. 画像メタデータテーブル
```typescript
interface ImageMetadata {
  // プライマリキー
  PK: string;                    // "IMAGE#${imageId}"
  SK: string;                    // "METADATA"
  
  // 画像情報
  imageId: string;               // UUID
  fileName: string;              // オリジナルファイル名
  fileSize: number;              // ファイルサイズ（bytes）
  mimeType: string;              // MIME タイプ
  width: number;                 // 画像幅
  height: number;                // 画像高さ
  
  // メタデータ
  uploadedAt: string;            // アップロード日時（ISO 8601）
  capturedAt?: string;           // 撮影日時（EXIF）
  tags: string[];                // タグ配列
  isPublic: boolean;             // 公開状態
  
  // ユーザー情報
  ownerId: string;               // 所有者ID
  ownerName: string;             // 所有者名
  
  // ストレージ情報
  s3Key: string;                 // S3オブジェクトキー
  thumbnailKeys: {
    small: string;
    medium: string;
    large: string;
  };
  
  // 検索用
  GSI1PK: string;                // "USER#${ownerId}"
  GSI1SK: string;                // "${uploadedAt}#${imageId}"
  GSI2PK: string;                // "PUBLIC#${isPublic}"
  GSI2SK: string;                // "${capturedAt}#${imageId}"
}
```

#### 2. タグ管理テーブル
```typescript
interface TagMetadata {
  // プライマリキー
  PK: string;                    // "TAG#${tagName}"
  SK: string;                    // "METADATA"
  
  // タグ情報
  tagName: string;               // タグ名
  usageCount: number;            // 使用回数
  createdAt: string;             // 作成日時
  lastUsedAt: string;            // 最終使用日時
}
```

#### 3. ユーザー情報テーブル
```typescript
interface UserMetadata {
  // プライマリキー
  PK: string;                    // "USER#${userId}"
  SK: string;                    // "PROFILE"
  
  // ユーザー情報
  userId: string;                // Cognito User ID
  email: string;                 // メールアドレス
  displayName: string;           // 表示名
  role: 'SYSTEM_ADMIN' | 'IMAGE_MANAGER' | 'REGULAR_USER';  // ユーザー権限
  
  // 統計情報
  imageCount: number;            // アップロード画像数
  storageUsed: number;           // 使用ストレージ（bytes）
  
  // 日時情報
  createdAt: string;             // アカウント作成日時
  lastLoginAt: string;           // 最終ログイン日時
}
```

### DynamoDB インデックス設計

#### 1. GSI1: ユーザー別画像一覧
```typescript
interface GSI1 {
  PK: string;                    // "USER#${ownerId}"
  SK: string;                    // "${uploadedAt}#${imageId}"
  
  // 用途: 管理画面でのユーザー別画像一覧
  // ソート: アップロード日時の降順
}
```

#### 2. GSI2: 公開画像一覧
```typescript
interface GSI2 {
  PK: string;                    // "PUBLIC#true"
  SK: string;                    // "${capturedAt}#${imageId}"
  
  // 用途: 公開画面での画像一覧
  // ソート: 撮影日時の降順
}
```

### ページネーション戦略

#### 1. 管理画面（オフセットベース）
```typescript
interface AdminPagination {
  page: number;                  // ページ番号（1から開始）
  limit: number;                 // 1ページあたりの件数（50件固定）
  total: number;                 // 総件数
  totalPages: number;            // 総ページ数
}
```

#### 2. 公開画面（カーソルベース）
```typescript
interface PublicPagination {
  cursor?: string;               // 次のページのカーソル
  limit: number;                 // 1回の読み込み件数
  hasMore: boolean;              // 次のページの有無
}
```

## 正確性プロパティ

*プロパティとは、システムのすべての有効な実行において真であるべき特性や動作のことです。これらは人間が読める仕様と機械で検証可能な正確性保証の橋渡しとなります。*

### プロパティ1: 有効画像アップロード保存
*すべての*有効なJPEG画像ファイルについて、アップロード処理を実行すると、その画像がS3ストレージに正しく保存される
**検証: 要件 1.1**

### プロパティ2: 複数ファイル一括アップロード
*すべての*有効なJPEG画像ファイルの配列について、一括アップロード処理を実行すると、すべてのファイルがS3ストレージに保存される
**検証: 要件 1.2**

### プロパティ3: フォルダアップロード完全性
*すべての*JPEG画像ファイルを含むフォルダについて、フォルダアップロード処理を実行すると、フォルダ内のすべてのJPEG画像ファイルがS3ストレージに保存される
**検証: 要件 1.3**

### プロパティ4: 無効ファイル拒否
*すべての*JPEG以外のファイル形式について、アップロード処理を実行すると、エラーメッセージが返され、ファイルはS3ストレージに保存されない
**検証: 要件 1.4**

### プロパティ5: メタデータ自動生成
*すべての*画像ファイルについて、アップロード処理を実行すると、適切なメタデータ（ファイル名、サイズ、アップロード日時、所有者情報）がDynamoDBに保存される
**検証: 要件 1.5**

### プロパティ6: ファイルサイズ制限
*すべての*制限サイズを超えるファイルについて、アップロード処理を実行すると、エラーメッセージが返され、ファイルはS3ストレージに保存されない
**検証: 要件 1.7**

### プロパティ7: タグ追加保存
*すべての*画像とタグの組み合わせについて、タグ追加処理を実行すると、そのタグが画像のメタデータに正しく保存される
**検証: 要件 2.1**

### プロパティ8: タグ削除
*すべての*タグ付き画像について、特定のタグ削除処理を実行すると、そのタグが画像のメタデータから削除される
**検証: 要件 2.2**

### プロパティ9: 複数タグ追加
*すべての*画像と複数タグの組み合わせについて、複数タグ追加処理を実行すると、すべてのタグが画像のメタデータに保存される
**検証: 要件 2.3**

### プロパティ10: タグ重複防止
*すべての*既存タグ付き画像について、同じタグを再度追加しようとすると、重複が防がれ、タグは1つのみ保持される
**検証: 要件 2.5**

### プロパティ11: 無限スクロール読み込み
*すべての*スクロール位置について、次のページ読み込み処理を実行すると、指定件数の次の画像が正しく読み込まれる
**検証: 要件 3.2**

### プロパティ12: サムネイルクリック拡大表示
*すべての*サムネイル画像について、クリック処理を実行すると、対応する拡大画像がモーダルビューで表示される
**検証: 要件 3.3**

### プロパティ13: 拡大表示詳細情報
*すべての*画像について、拡大表示処理を実行すると、画像の詳細情報（ファイル名、撮影日時、タグ等）が含まれて表示される
**検証: 要件 3.4**

### プロパティ14: 拡大表示ナビゲーション
*すべての*画像について、拡大表示中に前後移動処理を実行すると、正しい前後の画像に移動できる
**検証: 要件 3.5**

### プロパティ15: ユーザー権限別画像表示
*すべての*Regular_Userについて、管理画面アクセス処理を実行すると、自分がアップロードした画像のみが表示される
**検証: 要件 4.1**

### プロパティ16: システム管理者全画像表示
*すべての*System_Adminについて、管理画面アクセス処理を実行すると、すべてのユーザーの画像が表示される
**検証: 要件 4.2**

### プロパティ17: 画像管理者全画像表示
*すべての*Image_Managerについて、管理画面アクセス処理を実行すると、すべてのユーザーの画像が表示される
**検証: 要件 4.3**

### プロパティ18: ページネーション正確性
*すべての*ページ番号について、ページネーション処理を実行すると、指定されたページの正しい画像（50件）が表示される
**検証: 要件 4.4**

### プロパティ19: 公開状態変更権限
*すべての*System_AdminまたはImage_Managerについて、任意の画像の公開状態変更処理を実行すると、Viewer_Screenでの表示状態が正しく更新される
**検証: 要件 4.6, 4.7**

### プロパティ20: 画像情報編集権限
*すべての*System_Adminについて、任意の画像の情報編集処理を実行すると、変更がメタデータに正しく反映される
**検証: 要件 4.8**

### プロパティ21: 選択状態管理
*すべての*画像について、チェックボックス操作を実行すると、選択状態が正しく管理される
**検証: 要件 4.10**

### プロパティ22: 一括削除実行
*すべての*チェックされた画像の組み合わせについて、一括削除処理を実行すると、チェックされたすべての画像が削除される
**検証: 要件 4.12**

### プロパティ23: アクセス制御
*すべての*Regular_Userについて、他のユーザーの画像に対する操作（アクセス・削除）を実行しようとすると、操作が拒否される
**検証: 要件 4.13, 5.8**

### プロパティ24: 画像管理者操作制限
*すべての*Image_Managerについて、画像の編集や削除を試みると、操作が拒否される
**検証: 要件 4.14, 5.9**

### プロパティ25: ページ情報表示
*すべての*ページについて、ページ表示処理を実行すると、現在のページ位置と総ページ数が正しく表示される
**検証: 要件 4.15**

### プロパティ26: 画像削除完全性
*すべての*画像について、削除処理を実行すると、画像がS3ストレージから削除され、関連するメタデータとタグもDynamoDBから削除される
**検証: 要件 5.4, 5.5**

### プロパティ27: 削除エラー時状態維持
*すべての*削除エラー状況について、削除処理でエラーが発生すると、元の状態が維持される
**検証: 要件 5.7**

### プロパティ28: 削除後ページ調整
*すべての*最後のページについて、ページ内の全画像を削除すると、前のページに自動的に移動する
**検証: 要件 5.11**

### プロパティ29: 画像ダウンロード権限
*すべての*System_AdminまたはImage_Managerについて、任意の画像のダウンロード処理を実行すると、オリジナル画像がダウンロードされる
**検証: 要件 6.1, 6.2**

### プロパティ30: 自分の画像ダウンロード
*すべての*Regular_Userについて、自分の画像のダウンロード処理を実行すると、オリジナル画像がダウンロードされる
**検証: 要件 6.3**

### プロパティ31: ダウンロードアクセス制御
*すべての*Regular_Userについて、他のユーザーの画像をダウンロードしようとすると、操作が拒否される
**検証: 要件 6.4**

### プロパティ32: 一括ダウンロード
*すべての*チェックされた画像の組み合わせについて、一括ダウンロード処理を実行すると、すべての画像がZIPファイルにまとめられてダウンロードされる
**検証: 要件 6.6**

### プロパティ33: キーワード検索
*すべての*検索キーワードについて、検索処理を実行すると、ファイル名とタグに基づく正しい検索結果が返される
**検証: 要件 7.1**

### プロパティ34: 複合フィルター
*すべての*フィルター条件の組み合わせ（タグ、撮影日）について、フィルター処理を実行すると、すべての条件に一致する画像のみが表示される
**検証: 要件 7.2, 7.3, 7.4**

### プロパティ35: フィルタークリア
*すべての*フィルター適用状態について、フィルタークリア処理を実行すると、すべての画像が再表示される
**検証: 要件 7.6**

### プロパティ36: リアルタイム検索更新
*すべての*検索条件変更について、検索条件を変更すると、リアルタイムで結果が更新される
**検証: 要件 7.7**

### プロパティ37: フィルター時無限スクロール維持
*すべての*フィルター適用状態について、フィルター適用後も無限スクロール機能が正常に動作する
**検証: 要件 7.8**

### プロパティ38: スライドショー開始
*すべての*画像一覧状態について、スライドショー開始処理を実行すると、自動スライドショーが開始される
**検証: 要件 8.1**

### プロパティ39: スライドショー自動移動
*すべての*スライドショー状態について、指定された間隔で次の画像に自動的に移動する
**検証: 要件 8.2**

### プロパティ40: スライドショー一時停止・再開
*すべての*スライドショー状態について、一時停止処理を実行すると自動移動が停止し、再開処理を実行すると自動移動が再開される
**検証: 要件 8.3, 8.4**

### プロパティ41: スライドショー手動操作
*すべての*スライドショー状態について、手動での前後移動処理を実行すると、正しい前後の画像に移動できる
**検証: 要件 8.5**

### プロパティ42: スライドショー終了時動作
*すべての*スライドショー設定について、最後の画像に到達すると、設定に応じて最初の画像に戻るか停止する
**検証: 要件 8.6**

### プロパティ43: スライドショー終了
*すべての*スライドショー状態について、終了処理を実行すると、通常の表示モードに戻る
**検証: 要件 8.7**

### プロパティ44: スライドショー位置表示
*すべての*スライドショー状態について、現在の画像位置が正しく表示される
**検証: 要件 8.8**

## 実装の詳細

### 1. API Gateway設定

#### CORS設定
- **プリフライトリクエスト**: すべてのエンドポイントでOPTIONSメソッドを有効化
- **レスポンスヘッダー**: 
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Headers: Content-Type,Authorization`
  - `Access-Control-Allow-Methods: GET,POST,PUT,DELETE,PATCH,OPTIONS`

#### Gateway Responses
認証エラー時にLambda関数を呼ぶ前にAPI Gatewayがエラーを返すため、CORSヘッダーを含むGateway Responsesを設定:
- **UNAUTHORIZED (401)**: 認証トークンが無効または期限切れ
- **ACCESS_DENIED (403)**: 権限不足
- **DEFAULT_4XX**: その他の4xxエラー
- **DEFAULT_5XX**: サーバーエラー

#### バイナリメディアタイプ
一括ダウンロード（ZIP）等のバイナリレスポンスに対応するため、API Gatewayにバイナリメディアタイプを設定:
- `application/zip`
- `application/octet-stream`

#### ペイロード制限
- **最大サイズ**: 10MB（API Gatewayの制限）
- **対応策**: フロントエンドでファイルを6MB以下のバッチに分割して順次アップロード
  - base64エンコード後のサイズを考慮（約33%増加）
  - バッチごとに進捗表示

### 2. 一括ダウンロード機能（S3署名付きURL方式）

#### 概要
一括ダウンロードはLambda関数内でZIPファイルを生成し、S3に一時保存した後、署名付きURLをフロントエンドに返す方式を採用。フロントエンドは署名付きURLを使って直接S3からZIPをダウンロードする。

#### 大量画像対応（最大200枚）
- **最大ダウンロード件数**: 200枚
- **Lambda設定**: タイムアウト300秒、メモリ2048MB
- **メモリ内ZIP生成**: AdmZip ライブラリを使用し、S3から画像をBufferとして取得してZIPに追加
  - `s3Response.Body.transformToByteArray()`でAWS SDK v3のBodyをByteArrayに変換
  - `Buffer.from(bodyBytes)`でBufferに変換してAdmZipに追加
  - `zip.toBuffer()`でZIPバッファを生成
- **S3アップロード**: `PutObjectCommand`でZIPバッファをS3に直接アップロード
- **一時ファイル保存先**: `tmp/downloads/{userId}/{timestamp}.zip`
- **署名付きURL生成**: `ResponseContentDisposition: attachment`と`ResponseContentType: application/zip`を指定し、ブラウザが自動的にZIPファイルとしてダウンロードするようにする
- **署名付きURL有効期限**: 10分（600秒）
- **一時ファイルのクリーンアップ**: S3ライフサイクルルールで`tmp/`プレフィックスのオブジェクトを1日後に自動削除

#### フロントエンド実装
- APIから署名付きURLを取得後、`window.open(downloadUrl, '_blank')`でダウンロードをトリガー
- 署名付きURLに`ResponseContentDisposition: attachment`が含まれているため、ブラウザが自動的にファイルダウンロードを開始
- `fetch`+Blob方式は使用しない（CORSの問題やファイルサイズ制限を回避）

#### 分割ダウンロード（フロントエンド制御）
50枚を超える画像を選択した場合、フロントエンド側で自動的にバッチ分割してダウンロードする:
- **バッチサイズ**: 50枚ずつ
- **進捗表示**: 「ZIP生成中... (1/4)」のようにバッチ進捗を表示
- **順次実行**: 各バッチを順次APIに送信し、ZIPダウンロードを実行
- **バッチ間隔**: 2秒の待機時間を設けてブラウザのダウンロード開始を待つ

#### 大量操作時のユーザーアナウンス
- **アップロード**: 10枚以上のファイルを選択した場合、処理開始時に「{N}件のファイルを処理します。しばらくお待ちください...」と表示
- **ダウンロード**: 20枚以上の画像を選択した場合、確認ダイアログで「枚数が多いため時間がかかる場合があります。続行しますか？」と表示

```typescript
const BATCH_SIZE = 50;
const batches = chunkArray(imageIds, BATCH_SIZE);
for (let i = 0; i < batches.length; i++) {
  setDownloadProgress(`ZIP生成中... (${i + 1}/${batches.length})`);
  const downloadUrl = await bulkDownloadImages(batches[i]);
  window.open(downloadUrl, '_blank');
  await sleep(2000);
}
```

#### エラーハンドリング
- 個別画像の取得失敗時はスキップして続行
- 全画像取得失敗時は400エラーを返す
- Lambda タイムアウト対策として、処理時間を監視し残り時間が少ない場合は途中結果を返す（60秒の余裕を持つ）

### 2. Lambda関数実装

#### 依存パッケージ
- **uuid**: v9を使用（CommonJS対応）
  - v13はES Moduleのため、CommonJSにコンパイルされたLambda関数で読み込めない
  - v9はCommonJS形式で提供されているため互換性あり

#### 認証・認可処理
- **Cognitoグループ取得**: `cognito:groups`が文字列または配列で来る可能性に対応
  ```typescript
  const cognitoGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
  let groups: string[] = [];
  
  if (typeof cognitoGroups === 'string') {
    try {
      if (cognitoGroups.startsWith('[')) {
        groups = JSON.parse(cognitoGroups);
      } else {
        // 単一の文字列の場合（例: "System_Admin"）
        groups = [cognitoGroups];
      }
    } catch (error) {
      groups = [cognitoGroups];
    }
  } else if (Array.isArray(cognitoGroups)) {
    groups = cognitoGroups;
  }
  ```
- **権限チェック**: グループ名の配列に`System_Admin`または`Image_Manager`が含まれているかチェック

#### APIレスポンス形式
すべてのLambda関数は統一されたレスポンス形式を返す:
```typescript
// 成功レスポンス
{
  statusCode: 200,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify({
    success: true,
    data: {
      // レスポンスデータ
    }
  })
}

// エラーレスポンス
{
  statusCode: 400,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  },
  body: JSON.stringify({
    success: false,
    error: {
      message: 'エラーメッセージ',
      details: {}
    }
  })
}
```

### 3. フロントエンド実装

#### 認証機能
- **ログイン**: AWS Amplifyを使用したCognito認証
- **ログアウト**: `signOut()`を呼び出してセッションを終了し、ログイン画面にリダイレクト
  ```typescript
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('ログアウトに失敗しました:', error);
      alert('ログアウトに失敗しました');
    }
  };
  ```
- **セルフサインアップ**: Regular_User用のサインアップページ（reCAPTCHA v3統合）
- **自動ログイン**: サインアップ後の確認コード入力完了時に自動ログイン

#### React Strict Mode対応
- **問題**: React 18のStrictモードでuseEffectが2回実行され、同じ画像が2回追加される
- **解決**: `setImages`内で重複チェックを追加（imageIdでユニーク化）
  ```typescript
  setImages(prev => {
    const existingIds = new Set(prev.map(img => img.imageId));
    const newImages = response.data.images.filter(
      img => !existingIds.has(img.imageId)
    );
    return [...prev, ...newImages];
  });
  ```

#### APIクライアント
- **レスポンス構造**: `response.data.data`でデータを取得
  ```typescript
  const response = await api.get('/api/images/public');
  const images = response.data.data.images;
  ```

#### バッチアップロード
- **バッチサイズ**: 6MB以下（base64エンコード後のサイズを考慮）
- **進捗表示**: バッチ数とファイル数を表示
  ```typescript
  const BATCH_SIZE_LIMIT = 6 * 1024 * 1024; // 6MB
  const batches = createBatches(files, BATCH_SIZE_LIMIT);
  
  for (let i = 0; i < batches.length; i++) {
    setUploadProgress(`バッチ ${i + 1}/${batches.length} をアップロード中...`);
    await uploadBatch(batches[i]);
  }
  ```

#### レスポンシブグリッドレイアウト
画面幅いっぱいに画像を表示し、画面サイズに応じて自動的に列数を調整:
- **画面幅400px以上**: 2列
- **画面幅600px以上**: 3列
- **画面幅800px以上**: 4列
- **画面幅1000px以上**: 5列以上

```css
/* 管理画面のグリッドレイアウト */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

/* ビューワー画面のグリッドレイアウト */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
}

/* 親要素の幅制限を解除 */
.page-content {
  max-width: 100%;  /* 1400pxから変更 */
  margin: 0 auto;
  padding: 2rem;
}

/* bodyのflexレイアウトを削除（Viteのデフォルトテンプレートから） */
body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  /* display: flex; と place-items: center; を削除 */
}
```

**重要な修正点**:
1. `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))` でシンプルに設定
2. `.page-content` の `max-width` を `1400px` から `100%` に変更
3. `body` の `display: flex` と `place-items: center` を削除（Viteのデフォルトテンプレートに含まれていた設定）

### 4. サムネイル生成機能

#### Lambda関数配置
- **配置先**: `InfraStorageStack`（ストレージレイヤー）
  - 理由: S3イベント通知を設定するため、S3バケットと同じStackに配置
  - 以前は`AppAdminStack`に配置していたが、循環参照を避けるために移動

#### S3イベント通知設定
画像がアップロードされると自動的にサムネイル生成Lambda関数が実行される:
```typescript
// .jpgファイルのアップロード時
imagesBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(imageResizeFunction),
  {
    prefix: 'images/',
    suffix: '.jpg',
  }
);

// .jpegファイルのアップロード時
imagesBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.LambdaDestination(imageResizeFunction),
  {
    prefix: 'images/',
    suffix: '.jpeg',
  }
);
```

#### sharpモジュールのクロスプラットフォーム対応
Lambda関数はLinux環境で実行されるため、macOSやWindowsでビルドする場合はLinux用のsharpバイナリをインストールする必要がある:

```json
// lambda/package.json
{
  "scripts": {
    "build": "tsc && cp package.json package-lock.json dist/ && cd dist && npm install --omit=dev && npm install --os=linux --cpu=x64 sharp"
  }
}
```

**重要なポイント**:
1. `npm install --omit=dev` で本番用の依存パッケージをインストール
2. `npm install --os=linux --cpu=x64 sharp` でLinux用のsharpバイナリを追加インストール
3. この順序が重要（先にすべての依存パッケージをインストールしてから、sharpを上書き）

#### サムネイルサイズ
```typescript
const thumbnailSizes = {
  small: { width: 150, height: 150 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 600 }
};
```

#### Lambda関数設定
```typescript
const imageResizeFunction = new lambda.Function(this, 'ImageResizeFunction', {
  runtime: lambda.Runtime.NODEJS_24_X,
  handler: 'handlers/image-resize.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
  functionName: `ImageManagement-ImageResize-${environment}`,
  timeout: cdk.Duration.seconds(60),
  memorySize: 1024,  // 画像処理のため多めに設定
  environment: {
    THUMBNAILS_BUCKET: props.thumbnailsBucketName,
    IMAGES_TABLE: props.imagesTableName,
    LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
  },
});
```

### 5. Cognito設定

#### ユーザープール設定
- **セルフサインアップ**: 有効（Regular_Userのみ自分でアカウント作成可能）
- **標準属性**:
  - `email`: 必須、変更可能
  - `name` (fullname): オプション、変更可能（ユーザー表示名として使用）
- **パスワードポリシー**: 
  - 最小長: 8文字
  - 大文字、小文字、数字、記号を含む
- **MFA**: オプション（推奨）
- **メール検証**: 必須（確認コードをメールで送信）

#### ユーザー名の取得優先順位
画像のownerNameやユーザー表示名を取得する際の優先順位:
1. `name` (Cognito標準属性) - サインアップ時に入力された名前
2. `cognito:username` - Cognitoのユーザー名
3. `email` - メールアドレス
4. `Test User` - フォールバック値

```typescript
const userName = event.requestContext.authorizer?.claims?.name || 
                 event.requestContext.authorizer?.claims?.['cognito:username'] || 
                 event.requestContext.authorizer?.claims?.email || 
                 'Test User';
```

#### App Client設定
- **認証フロー**: USER_PASSWORD_AUTH
- **トークン有効期限**: 
  - アクセストークン: 1時間
  - リフレッシュトークン: 30日
- **属性設定**: 削除（デフォルトの属性のみ使用）

#### Lambda Triggers
- **Post Confirmation**: サインアップ後に自動的にRegular_Userグループに追加
  - トリガー関数: `post-confirmation.ts`
  - 処理内容: Cognitoグループ `Regular_User` にユーザーを追加

#### ユーザーグループ
- **System_Admin**: すべての操作が可能（管理者が手動で割り当て）
- **Image_Manager**: 画像の閲覧・ダウンロード・公開状態変更が可能（管理者が手動で割り当て）
- **Regular_User**: 自分の画像のみ操作可能（セルフサインアップ時に自動割り当て）

#### セルフサインアップフロー
```
1. ユーザーが /signup にアクセス
   ↓
2. 名前、メールアドレス、パスワードを入力
   ↓
3. reCAPTCHA v3が自動的にトークンを生成
   ↓
4. バックエンドでreCAPTCHAトークンを検証（スコア >= 0.5）
   ↓
5. Cognitoにサインアップリクエスト（name属性を含む）
   ↓
6. 確認コードがメールで送信される
   ↓
7. ユーザーが確認コードを入力
   ↓
8. Post Confirmation Triggerが実行
   ↓
9. 自動的にRegular_Userグループに追加
   ↓
10. 自動ログイン
   ↓
11. 管理画面にリダイレクト
```

#### reCAPTCHA v3統合
- **目的**: ボット対策、スパムアカウント作成防止
- **バージョン**: reCAPTCHA v3（目に見えないチェック）
- **スコア閾値**: 0.5（0.0〜1.0のスコアで判定）
- **検証エンドポイント**: `POST /api/admin/auth/verify-recaptcha`
- **Site Key**: 環境変数 `VITE_RECAPTCHA_SITE_KEY`
- **Secret Key**: 環境変数 `RECAPTCHA_SECRET_KEY`（Lambda関数）

## エラーハンドリング

### 1. アップロードエラー
- **ファイルサイズ超過**: 制限サイズを超えるファイルは拒否し、適切なエラーメッセージを表示
- **無効ファイル形式**: JPEG以外の形式は拒否し、エラーメッセージを表示
- **ネットワークエラー**: アップロード中の接続エラーは再試行機能を提供
- **ストレージエラー**: S3への保存失敗時は適切なエラーメッセージを表示
- **API Gateway制限**: 10MBを超えるリクエストはバッチ分割して送信

### 2. 認証・認可エラー
- **認証失敗**: 無効な認証情報はログイン画面にリダイレクト
- **セッション期限切れ**: 期限切れセッションは再認証を要求
- **権限不足**: 権限のない操作は403エラーで拒否（CORSヘッダー付き）
- **不正アクセス**: 他ユーザーのデータアクセスは拒否

### 3. データ処理エラー
- **データベースエラー**: DynamoDB操作失敗時は適切なエラーメッセージを表示
- **データ不整合**: メタデータと実ファイルの不整合は自動修復または警告表示
- **削除エラー**: 削除失敗時は元の状態を維持し、エラーメッセージを表示

### 4. UI/UXエラー
- **読み込みエラー**: 画像読み込み失敗時は代替画像またはエラー表示
- **検索エラー**: 検索処理失敗時は適切なエラーメッセージを表示
- **ページネーションエラー**: 無効なページアクセス時は有効なページにリダイレクト
- **重複表示防止**: React Strict Modeでの重複実行に対応

## テスト戦略

### デュアルテストアプローチ

本システムでは、**ユニットテスト**と**プロパティベーステスト**の両方を使用して包括的なテストカバレッジを実現します。

#### ユニットテスト
- **具体的な例**: 特定の入力に対する期待される出力を検証
- **エッジケース**: 境界値や特殊な条件での動作を検証
- **エラー条件**: 異常系の処理を検証
- **統合ポイント**: コンポーネント間の連携を検証

#### プロパティベーステスト
- **汎用プロパティ**: すべての入力に対して成り立つべき性質を検証
- **ランダム入力**: 大量のランダムな入力での動作を検証
- **不変条件**: システムの不変条件を検証
- **ラウンドトリップ**: データの往復変換での一貫性を検証

### プロパティベーステスト設定

#### テストライブラリ
- **フロントエンド**: fast-check（TypeScript/JavaScript用）
- **バックエンド**: fast-check（Node.js Lambda用）

#### テスト設定
- **最小実行回数**: 各プロパティテストは最低100回実行
- **タグ形式**: `**Feature: image-management, Property {番号}: {プロパティテキスト}**`
- **テスト分離**: 各正確性プロパティは単一のプロパティベーステストで実装

#### 例: プロパティテスト実装
```typescript
// プロパティ1のテスト例
describe('Feature: image-management, Property 1: 有効画像アップロード保存', () => {
  it('すべての有効な画像ファイルがS3に正しく保存される', async () => {
    await fc.assert(
      fc.asyncProperty(
        validImageFileArbitrary(),
        async (imageFile) => {
          const result = await uploadImage(imageFile);
          const s3Object = await getS3Object(result.s3Key);
          
          expect(result.success).toBe(true);
          expect(s3Object).toBeDefined();
          expect(s3Object.ContentLength).toBe(imageFile.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### テストデータ生成戦略

#### スマートジェネレーター
- **有効画像**: JPEG形式の実際の画像データを生成
- **無効ファイル**: PNG、GIF、テキストファイル、実行ファイルなどのJPEG以外の形式を生成
- **ユーザーデータ**: 権限レベルの異なるユーザーを生成
- **メタデータ**: 現実的なファイル名、タグ、日時を生成

#### 制約条件
- **ファイルサイズ**: 1KB〜100MBの範囲で生成
- **タグ数**: 0〜20個の範囲で生成
- **ユーザー数**: 1〜1000ユーザーの範囲で生成
- **画像数**: 1〜10000画像の範囲で生成

## 今後の拡張機能

### 一括タグ付け機能（管理画面）

#### 機能概要
選択した複数の画像に対して、一括でタグを追加する機能。

#### 仕様
- 画像一覧でチェックボックスで複数画像を選択後、「一括タグ付け」ボタンを押す
- タグ入力ダイアログが表示され、追加するタグを入力（複数タグ対応）
- 既存のTagInputコンポーネントを再利用（オートコンプリート付き）
- 選択した全画像に対して指定タグを追加（既に付いているタグは重複しない）
- 権限: System_Adminは全画像、Regular_Userは自分の画像のみ

#### APIエンドポイント
```typescript
// 一括タグ追加
'POST /api/admin/images/tags/bulk': {
  body: { imageIds: string[]; tags: string[] };
  response: {
    success: number;    // 成功件数
    failed: number;     // 失敗件数
    failedImages: Array<{ imageId: string; reason: string }>;
  };
};
```

### レーティング機能（管理画面）

#### 機能概要
管理者が画像に対して1〜5段階の星評価を付与する機能。

#### 仕様
- **星評価**: 1〜5段階（星アイコンをクリックして設定）
- **評価者**: ログイン済み管理ユーザーのみ（System_Admin, Image_Manager, Regular_User）
- **1画像1ユーザー1評価**: 同じユーザーが再評価すると上書き
- **平均評価**: 全ユーザーの評価の平均値を画像カードに表示（星アイコン + 数値）
- **評価数**: 評価した人数を表示
- **画像カード表示**: 平均レーティングと評価数を常時表示
- **拡大表示（モーダル）**: 詳細情報に評価セクションを追加、自分の評価を変更可能
- **検索フィルター**: レーティングでの絞り込みを追加（例: 4以上の画像のみ表示）

#### データモデル
```typescript
// レーティングレコード（ImagesTableに保存）
interface ImageRating {
  PK: string;                    // "IMAGE#${imageId}"
  SK: string;                    // "RATING#${userId}"
  imageId: string;
  userId: string;
  rating: number;                // 1〜5
  ratedAt: string;               // ISO 8601
}

// ImageMetadataに追加するフィールド
interface ImageMetadataExtension {
  averageRating?: number;        // 平均評価（1.0〜5.0、小数点1桁）
  ratingCount?: number;          // 評価数
}
```

#### APIエンドポイント
```typescript
// レーティング追加・更新（管理画面）
'POST /api/admin/images/:id/rating': {
  body: { rating: number };      // 1〜5
  response: { averageRating: number; ratingCount: number; myRating: number };
};

// 自分のレーティング取得（管理画面）
'GET /api/admin/images/:id/rating': {
  response: { averageRating: number; ratingCount: number; myRating: number | null };
};
```

#### レーティング絞り込み
管理画面の画像一覧にレーティングフィルターを追加:
- ドロップダウンまたはスライダーで最低レーティングを指定（例: 「3以上」「4以上」）
- APIの`GET /api/admin/images`に`minRating`クエリパラメータを追加
- DynamoDBでのフィルタリング: Scan/Queryの`FilterExpression`で`averageRating >= :minRating`

### Like機能（ビューアー画面）

#### 機能概要
ビューアー画面で閲覧者が画像に「いいね」を付けられる機能。認証不要で、ブラウザのローカルストレージでLike状態を管理する。

#### 仕様
- **Likeボタン**: ハートアイコン（♡ / ♥）をクリックでトグル
- **認証不要**: ログインなしでLike可能
- **Like状態管理**: ブラウザのlocalStorageにLike済み画像IDを保存
- **Like数表示**: 画像カードとモーダルにLike数を常時表示
- **重複防止**: 同一ブラウザから同じ画像に2回Likeできない（トグルで解除は可能）

#### データモデル
```typescript
// ImageMetadataに追加するフィールド
interface ImageMetadataLikeExtension {
  likeCount?: number;            // Like数（デフォルト0）
}
```

#### APIエンドポイント
```typescript
// Like追加（ビューアー画面、認証不要）
'POST /api/public/images/:id/like': {
  response: { likeCount: number };
};

// Like解除（ビューアー画面、認証不要）
'DELETE /api/public/images/:id/like': {
  response: { likeCount: number };
};
```

#### フロントエンド実装
```typescript
// localStorage でLike状態を管理
const LIKED_IMAGES_KEY = 'likedImages';

const getLikedImages = (): Set<string> => {
  const stored = localStorage.getItem(LIKED_IMAGES_KEY);
  return stored ? new Set(JSON.parse(stored)) : new Set();
};

const toggleLike = async (imageId: string) => {
  const liked = getLikedImages();
  if (liked.has(imageId)) {
    liked.delete(imageId);
    await unlikeImage(imageId);
  } else {
    liked.add(imageId);
    await likeImage(imageId);
  }
  localStorage.setItem(LIKED_IMAGES_KEY, JSON.stringify([...liked]));
};
```

#### DynamoDB更新
Like/Unlike時に`ImageMetadata`の`likeCount`をアトミックにインクリメント/デクリメント:
```typescript
// UpdateExpression
'SET likeCount = if_not_exists(likeCount, :zero) + :inc'
// または
'SET likeCount = likeCount - :dec'
```