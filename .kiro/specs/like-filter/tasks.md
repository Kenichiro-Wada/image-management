# 実装計画: Likeフィルター

## 概要

管理画面の画像一覧にLikeフィルタリング機能を追加する。バックエンド（Lambda）でlikeCountのレスポンス追加とhasLikesフィルタリングを実装し、フロントエンド（React）で型定義の更新、サービス関数の拡張、フィルターUI追加、画像カードへのLike数表示を行う。実装はバックエンド → 型定義 → サービス → UI の順で進める。

## タスク

- [x] 1. バックエンドのlikeCount対応とhasLikesフィルタリング実装
  - [x] 1.1 formatImageItem関数にlikeCountフィールドを追加する
    - `lambda/src/handlers/image-list.ts` の `formatImageItem` 関数を変更
    - 返却オブジェクトに `likeCount: item.likeCount || 0` を追加
    - DynamoDBの `likeCount` が未定義・null の場合は `0` をデフォルト値として返却
    - _要件: 1.1, 1.2_

  - [x] 1.2 hasLikesクエリパラメータによるフィルタリングを実装する
    - `lambda/src/handlers/image-list.ts` の `handler` 関数を変更
    - `event.queryStringParameters?.hasLikes === 'true'` でパラメータを取得
    - `hasLikes` を `getUserImages` と `getAllImages` 関数の引数に追加
    - 両関数内で `if (hasLikes) { allItems = allItems.filter(item => (item.likeCount || 0) >= 1); }` を追加（`minRating` フィルターと同じパターン）
    - フィルタリングはページネーション計算の前に適用する
    - _要件: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 1.3 formatImageItemのlikeCountプロパティテストを作成する
    - `lambda/src/handlers/image-list.test.ts` に追加
    - **Property 1: formatImageItemはlikeCountを数値で返却する**
    - **検証: 要件 1.1, 1.2**
    - fast-checkで任意のDynamoDB画像アイテム（likeCountがundefined, null, 0, 正の整数）を生成
    - 出力のlikeCountがnumber型であり、元データが未定義の場合は0であることを検証

  - [ ]* 1.4 hasLikesフィルタリングのプロパティテストを作成する
    - `lambda/src/handlers/image-list.test.ts` に追加
    - **Property 2: hasLikesフィルタリングの正確性**
    - **検証: 要件 2.1, 2.2**
    - fast-checkで任意の画像リスト（likeCountが0〜100のランダム値）とhasLikesフラグを生成
    - hasLikes=trueの場合は全アイテムのlikeCount >= 1、未指定の場合はアイテム数が変わらないことを検証

  - [ ]* 1.5 複合フィルタリングのプロパティテストを作成する
    - `lambda/src/handlers/image-list.test.ts` に追加
    - **Property 3: 複合フィルタリングの正確性**
    - **検証: 要件 2.3**
    - fast-checkで任意の画像リスト、minRating（0〜5）、hasLikes（true/undefined）を生成
    - 結果の全アイテムがlikeCount >= 1かつaverageRating >= minRatingを満たすことを検証

  - [ ]* 1.6 フィルタリング後のページネーション計算のプロパティテストを作成する
    - `lambda/src/handlers/image-list.test.ts` に追加
    - **Property 4: フィルタリング後のページネーション計算**
    - **検証: 要件 2.4**
    - fast-checkで任意の画像リスト（0〜200件）とフィルタ条件を生成
    - totalCountとtotalPagesが正しく計算されることを検証

- [x] 2. チェックポイント - バックエンドの動作確認
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [x] 3. フロントエンドの型定義とサービス関数の更新
  - [x] 3.1 ImageMetadataインターフェースにlikeCountを追加する
    - `frontend-admin/src/types/index.ts` の `ImageMetadata` インターフェースを変更
    - `likeCount?: number;` をレーティング情報の下に追加
    - _要件: 5.1_

  - [x] 3.2 getImages関数にhasLikesパラメータを追加する
    - `frontend-admin/src/services/images.ts` の `getImages` 関数を変更
    - 引数に `hasLikes?: boolean` を追加
    - `if (hasLikes) { params.hasLikes = 'true'; }` を追加
    - _要件: 5.2_

- [x] 4. 管理画面のフィルターUIとLike数表示の実装
  - [x] 4.1 ImageListに「Likeあり」チェックボックスフィルターを追加する
    - `frontend-admin/src/components/ImageList.tsx` を変更
    - `hasLikesFilter` ステート（`useState<boolean>(false)`）を追加
    - `list-filters` 内の既存レーティングフィルターの隣に「Likeあり」チェックボックスを追加
    - `loadImages` 内で `getImages` に `hasLikesFilter || undefined` を渡す
    - `useEffect` の依存配列に `hasLikesFilter` を追加
    - チェックボックス変更時に `setCurrentPage(1)` でページをリセット
    - _要件: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.2 ImageCardにLike数バッジを表示する
    - `frontend-admin/src/components/ImageCard.tsx` を変更
    - レーティング表示の下に `likeCount` が1以上の場合のみ `❤️ {image.likeCount}` を表示
    - `likeCount` が0またはundefinedの場合はLike表示要素を省略
    - _要件: 4.1, 4.2, 4.3_

  - [ ]* 4.3 フィルター変更時のページリセットのプロパティテストを作成する
    - `frontend-admin/src/components/ImageList.test.tsx` に追加
    - **Property 5: フィルター変更時のページリセット**
    - **検証: 要件 3.4**
    - fast-checkで任意の現在ページ番号（1〜100）とフィルター状態の変更を生成
    - 変更後のcurrentPageが1であることを検証

  - [ ]* 4.4 Like数表示フォーマットのプロパティテストを作成する
    - `frontend-admin/src/components/ImageCard.test.tsx` に追加
    - **Property 6: Like数の表示フォーマット**
    - **検証: 要件 4.1, 4.2, 4.3**
    - fast-checkで任意のlikeCount（0〜10000）を生成
    - likeCount >= 1の場合は❤️と数値が表示され、0の場合はLike表示要素が存在しないことを検証

  - [ ]* 4.5 フィルターUIとAPI呼び出しのユニットテストを作成する
    - `frontend-admin/src/components/ImageList.test.tsx` に追加
    - 「Likeあり」チェックボックスが存在することを検証（要件3.1）
    - チェックボックスON時に `hasLikes=true` パラメータでAPIが呼ばれることを検証（要件3.2）
    - チェックボックスOFF時に `hasLikes` パラメータなしでAPIが呼ばれることを検証（要件3.3）
    - minRatingとhasLikesの両方が設定された状態でAPIが正しいパラメータで呼ばれることを検証（要件3.5）
    - _要件: 3.1, 3.2, 3.3, 3.5_

  - [ ]* 4.6 ImageCardのLike数表示ユニットテストを作成する
    - `frontend-admin/src/components/ImageCard.test.tsx` に追加
    - likeCount=0の画像カードにLike表示要素が存在しないことを検証（要件4.2）
    - likeCountがundefinedの画像カードにLike表示要素が存在しないことを検証（要件4.2）
    - likeCount=5の画像カードに「❤️ 5」が表示されることを検証（要件4.1, 4.3）
    - _要件: 4.1, 4.2, 4.3_

- [x] 5. 最終チェックポイント - 全体の動作確認
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

## 備考

- `*` マーク付きのタスクはオプションで、MVP実装時にはスキップ可能
- 各タスクは具体的な要件を参照しており、トレーサビリティを確保
- チェックポイントで段階的に動作を検証
- プロパティテストは設計ドキュメントの正確性プロパティ（Property 1〜6）に対応
- ユニットテストはプロパティテストを補完し、具体的なシナリオとエッジケースをカバー
- バックエンドのテストはjest + fast-check、フロントエンドのテストはvitest + fast-checkを使用
