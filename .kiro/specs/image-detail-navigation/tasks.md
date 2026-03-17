# 実装計画: 画像詳細ナビゲーション

## 概要

ImageModal内で前後の画像に移動できるナビゲーション機能を実装する。モーダルの表示管理をImageListレベルに引き上げ、画像配列とインデックスをImageModalに渡すことで、モーダル内でのナビゲーションを実現する。実装はボトムアップで進め、新規コンポーネント → 既存コンポーネント変更 → 結合の順で行う。

## タスク

- [x] 1. NavigationButtonコンポーネントの作成
  - [x] 1.1 NavigationButtonコンポーネントを実装する
    - `frontend-admin/src/components/NavigationButton.tsx` を新規作成
    - `NavigationButtonProps` インターフェースを定義（`direction: 'prev' | 'next'`, `disabled: boolean`, `onClick: () => void`）
    - `direction` に応じて左矢印（◀）/ 右矢印（▶）アイコンを表示
    - `disabled` 時は非活性スタイルを適用し、`onClick` を無効化
    - `aria-label` で「前の画像」「次の画像」を設定（アクセシビリティ対応）
    - _要件: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.2 NavigationButtonのユニットテストを作成する
    - `frontend-admin/src/components/__tests__/NavigationButton.test.tsx` を新規作成
    - `direction='prev'` で「前の画像」の `aria-label` が設定されることを検証
    - `direction='next'` で「次の画像」の `aria-label` が設定されることを検証
    - `disabled=true` 時にクリックイベントが発火しないことを検証
    - `disabled=false` 時にクリックイベントが発火することを検証
    - _要件: 1.1, 1.2, 1.3_

- [x] 2. ImageModalにナビゲーション機能を追加する
  - [x] 2.1 ImageModalのpropsを拡張しナビゲーションUIを追加する
    - `frontend-admin/src/components/ImageModal.tsx` を変更
    - `ImageModalProps` に `images: ImageMetadata[]`, `currentIndex: number`, `onNavigate: (index: number) => void` を追加
    - `hasPrev`（`currentIndex > 0`）と `hasNext`（`currentIndex < images.length - 1`）を算出
    - 画像表示エリアの左右に `NavigationButton` を配置
    - 「N / M」形式の位置インジケーターを表示（`${currentIndex + 1} / ${images.length}`）
    - _要件: 1.1, 1.2, 1.3, 1.4, 3.3_

  - [x] 2.2 画像切り替え時の状態リセットロジックを実装する
    - `frontend-admin/src/components/ImageModal.tsx` を変更
    - `currentIndex` の変更を検知する `useEffect` を追加
    - 画像切り替え時に `image` を `images[currentIndex]` で更新
    - `loading` を `false` にリセット
    - `myRating`, `averageRating`, `ratingCount` を初期値にリセット
    - レーティング取得の `useEffect` が `image.imageId` の変更で再実行されることを確認
    - _要件: 2.5, 3.1, 3.2_

  - [x] 2.3 キーボードナビゲーションを実装する
    - `frontend-admin/src/components/ImageModal.tsx` を変更
    - 既存のESCキーハンドラを拡張し、`ArrowRight` と `ArrowLeft` のハンドリングを追加
    - `ArrowRight` 押下時: `hasNext` が `true` なら `onNavigate(currentIndex + 1)` を呼び出す
    - `ArrowLeft` 押下時: `hasPrev` が `true` なら `onNavigate(currentIndex - 1)` を呼び出す
    - _要件: 2.3, 2.4_

  - [ ]* 2.4 ナビゲーション境界条件のプロパティテストを作成する
    - `frontend-admin/src/components/__tests__/ImageModal.test.tsx` を新規作成
    - **Property 1: 境界でのナビゲーションボタン無効化**
    - **検証: 要件 1.2, 1.3, 1.4**
    - fast-checkで任意の長さ（1〜100）の画像配列と0〜length-1のインデックスを生成
    - インデックス0で `hasPrev=false`、`length-1` で `hasNext=false`、長さ1で両方 `false` を検証

  - [ ]* 2.5 ナビゲーション操作のプロパティテストを作成する
    - `frontend-admin/src/components/__tests__/ImageModal.test.tsx` に追加
    - **Property 2: ナビゲーション操作によるインデックス変化**
    - **検証: 要件 2.1, 2.2, 2.3, 2.4**
    - fast-checkで任意の画像配列、インデックス、操作方向を生成
    - 「次へ」でインデックス+1、「前へ」でインデックス-1、境界では変化なしを検証

  - [ ]* 2.6 位置ラベルのプロパティテストを作成する
    - `frontend-admin/src/components/__tests__/ImageModal.test.tsx` に追加
    - **Property 5: 位置ラベルのフォーマット**
    - **検証: 要件 3.3**
    - fast-checkで任意の配列長（1〜1000）とインデックスを生成
    - ラベルが `"${index+1} / ${length}"` と一致することを検証

  - [ ]* 2.7 画像切り替え時のデータ表示と状態リセットのプロパティテストを作成する
    - `frontend-admin/src/components/__tests__/ImageModal.test.tsx` に追加
    - **Property 3: 画像切り替え時の正しいデータ表示**
    - **Property 4: 画像切り替え時の編集状態リセット**
    - **検証: 要件 2.5, 3.1, 3.2**
    - fast-checkで任意の画像配列とナビゲーション操作シーケンスを生成
    - 切り替え後の画像データが配列の対応要素と一致し、loading状態がリセットされることを検証

- [x] 3. チェックポイント - NavigationButtonとImageModalの動作確認
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [x] 4. ImageCardからモーダル管理を除去する
  - [x] 4.1 ImageCardのモーダル管理をImageListに委譲する
    - `frontend-admin/src/components/ImageCard.tsx` を変更
    - `showModal` ステートと `ImageModal` のレンダリングを削除
    - `ImageCardProps` に `onOpenModal: () => void` を追加
    - サムネイルクリックと詳細ボタンクリック時に `onOpenModal` を呼び出すように変更
    - `ImageModal` の import を削除
    - _要件: 4.2_

  - [ ]* 4.2 ImageCardの変更に対する回帰テストを作成する
    - `frontend-admin/src/components/__tests__/ImageCard.test.tsx` を新規作成
    - サムネイルクリック時に `onOpenModal` が呼ばれることを検証
    - 詳細ボタンクリック時に `onOpenModal` が呼ばれることを検証
    - モーダルがImageCard内にレンダリングされないことを検証
    - _要件: 4.2_

- [x] 5. ImageListにモーダル管理を追加する
  - [x] 5.1 ImageListにモーダル表示状態管理を実装する
    - `frontend-admin/src/components/ImageList.tsx` を変更
    - `modalImageIndex` ステート（`number | null`）を追加
    - `handleOpenModal(index: number)`: `modalImageIndex` を設定してモーダルを開く
    - `handleCloseModal()`: `modalImageIndex` を `null` に設定してモーダルを閉じる
    - `handleNavigate(index: number)`: インデックスをクランプして `modalImageIndex` を更新
    - 画像配列が空の場合のガード処理を追加
    - _要件: 4.1, 4.2, 4.3_

  - [x] 5.2 ImageListにImageModalのレンダリングを追加する
    - `frontend-admin/src/components/ImageList.tsx` を変更
    - `modalImageIndex !== null` の場合に `ImageModal` をレンダリング
    - `images`, `currentIndex`, `onNavigate`, `onClose`, `onUpdate` を渡す
    - `onUpdate` で `loadImages(currentPage)` を呼び出し、画像一覧を再読み込み
    - 再読み込み後にインデックスが範囲外になった場合のクランプ処理を追加
    - `ImageCard` に `onOpenModal` コールバックを渡す
    - _要件: 4.3, 4.4_

  - [ ]* 5.3 ImageCardクリック時のインデックス設定のプロパティテストを作成する
    - `frontend-admin/src/components/__tests__/ImageList.test.tsx` を新規作成
    - **Property 6: ImageCardクリック時のインデックス設定**
    - **検証: 要件 4.2**
    - fast-checkで任意の画像配列とクリック対象のインデックスを生成
    - クリック後に `modalImageIndex` がクリックされたインデックスと一致することを検証

  - [ ]* 5.4 ImageListのモーダル管理ユニットテストを作成する
    - `frontend-admin/src/components/__tests__/ImageList.test.tsx` に追加
    - ImageCardクリックでモーダルが表示されることを検証
    - モーダル内で `onUpdate` が呼ばれた時に `loadImages` が再実行されることを検証
    - ESCキーでモーダルが閉じることを検証（回帰テスト）
    - _要件: 4.1, 4.4_

- [x] 6. 最終チェックポイント - 全体結合テスト
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

## 備考

- `*` マーク付きのタスクはオプションで、MVP実装時にはスキップ可能
- 各タスクは具体的な要件を参照しており、トレーサビリティを確保
- チェックポイントで段階的に動作を検証
- プロパティテストは設計ドキュメントの正確性プロパティに対応
- ユニットテストはプロパティテストを補完し、具体的なシナリオとエッジケースをカバー
