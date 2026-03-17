# 要件ドキュメント

## はじめに

管理画面（frontend-admin）の画像一覧に、ビューアー（frontend-viewer）でLikeが付いている画像のみを表示するフィルタリング機能を追加する。管理者がユーザーから人気のある画像を素早く特定・管理できるようにすることが目的。

現状、管理画面にはレーティング（minRating）によるフィルタリングが存在するが、ビューアーのLike情報に基づくフィルタリングは未実装。DynamoDBの画像メタデータには`likeCount`フィールドが既に存在するが、管理画面のAPIレスポンスには含まれていない。

## 用語集

- **管理画面（Admin_Panel）**: 画像管理システムの管理者向けフロントエンド（frontend-admin）
- **ビューアー（Viewer）**: 一般ユーザー向けの画像閲覧フロントエンド（frontend-viewer）
- **Like**: ビューアーで訪問者が画像に対して付ける「いいね」。DynamoDBの`likeCount`フィールドで集計される
- **Likeフィルター（Like_Filter）**: 管理画面の画像一覧で、Like数に基づいて画像を絞り込むフィルタリング機能
- **画像一覧API（Image_List_API）**: 管理画面向けの画像一覧取得エンドポイント（`GET /api/admin/images`）
- **画像メタデータ（Image_Metadata）**: DynamoDBに保存される画像の属性情報（ファイル名、サイズ、likeCount等）

## 要件

### 要件1: 画像一覧APIでlikeCount情報を返却する

**ユーザーストーリー:** 管理者として、画像一覧APIのレスポンスにLike数を含めてほしい。フロントエンドでLikeに基づくフィルタリングや表示を行えるようにするため。

#### 受け入れ基準

1. THE Image_List_API SHALL 画像メタデータのレスポンスに`likeCount`フィールド（数値型）を含める
2. WHEN 画像にLikeが付いていない場合、THE Image_List_API SHALL `likeCount`を`0`として返却する

### 要件2: Likeフィルタリングのバックエンド対応

**ユーザーストーリー:** 管理者として、Like付き画像のみをAPIレベルでフィルタリングしたい。大量の画像がある場合でもサーバーサイドで絞り込みを行い、効率的にデータを取得するため。

#### 受け入れ基準

1. WHEN `hasLikes=true`クエリパラメータが指定された場合、THE Image_List_API SHALL `likeCount`が1以上の画像のみを返却する
2. WHEN `hasLikes`クエリパラメータが指定されていない場合、THE Image_List_API SHALL 従来通りすべての画像を返却する
3. WHEN `hasLikes=true`と`minRating`が同時に指定された場合、THE Image_List_API SHALL 両方の条件を満たす画像のみを返却する
4. WHEN `hasLikes=true`でフィルタリングした場合、THE Image_List_API SHALL フィルタリング後の件数に基づいてページネーション情報を計算する

### 要件3: 管理画面にLikeフィルターUIを追加する

**ユーザーストーリー:** 管理者として、画像一覧画面でLikeが付いている画像だけを簡単に絞り込みたい。人気のある画像を素早く確認・管理するため。

#### 受け入れ基準

1. THE Admin_Panel SHALL 画像一覧のフィルターエリアに「Likeあり」フィルターのトグル（チェックボックスまたはスイッチ）を表示する
2. WHEN 管理者が「Likeあり」フィルターを有効にした場合、THE Admin_Panel SHALL `hasLikes=true`パラメータを付与してImage_List_APIを呼び出す
3. WHEN 管理者が「Likeあり」フィルターを無効にした場合、THE Admin_Panel SHALL フィルターなしで画像一覧を再取得する
4. WHEN 「Likeあり」フィルターの状態が変更された場合、THE Admin_Panel SHALL ページネーションを1ページ目にリセットする
5. THE Admin_Panel SHALL 「Likeあり」フィルターと既存の「最低レーティング」フィルターを同時に使用できるようにする

### 要件4: 画像カードにLike数を表示する

**ユーザーストーリー:** 管理者として、画像一覧の各画像カードにLike数を表示してほしい。個々の画像の人気度を一目で把握するため。

#### 受け入れ基準

1. WHEN 画像の`likeCount`が1以上の場合、THE Admin_Panel SHALL 画像カードにLike数を表示する
2. WHEN 画像の`likeCount`が0の場合、THE Admin_Panel SHALL Like数の表示を省略する
3. THE Admin_Panel SHALL Like数をハートアイコン（❤️）と数値の組み合わせで表示する

### 要件5: フロントエンドの型定義を更新する

**ユーザーストーリー:** 開発者として、管理画面のTypeScript型定義にlikeCount情報を追加したい。型安全にLike関連の機能を実装するため。

#### 受け入れ基準

1. THE Admin_Panel SHALL `ImageMetadata`インターフェースに`likeCount`フィールド（`number`型、オプショナル）を含める
2. THE Admin_Panel SHALL `getImages`関数に`hasLikes`パラメータ（`boolean`型、オプショナル）を受け付けるようにする
