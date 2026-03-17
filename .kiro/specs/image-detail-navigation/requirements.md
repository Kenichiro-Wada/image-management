# 要件ドキュメント

## はじめに

管理画面（frontend-admin）の画像詳細モーダルに、前後の画像へ移動できるナビゲーションボタンを追加する機能。現在、画像詳細を確認するにはモーダルを閉じて別の画像カードをクリックする必要があるが、モーダル内で直接前後の画像に移動できるようにすることで、画像の確認・管理作業の効率を向上させる。

## 用語集

- **ImageModal**: 画像詳細をオーバーレイ表示するモーダルコンポーネント
- **ImageList**: 画像一覧を管理するコンポーネント。ページネーション付きで画像配列を保持する
- **ImageCard**: 画像一覧内の個別カードコンポーネント。クリックでImageModalを表示する
- **NavigationButton**: ImageModal内に配置する前後移動用のボタン
- **CurrentIndex**: 画像一覧配列における現在表示中の画像の位置（0始まり）

## 要件

### 要件1: モーダル内ナビゲーションボタンの表示

**ユーザーストーリー:** 管理者として、画像詳細モーダル内で前後の画像に移動するボタンを確認したい。これにより、モーダルを閉じずに連続して画像を確認できる。

#### 受け入れ基準

1. WHEN ImageModalが表示される, THE ImageModal SHALL 画像表示エリアの左右にNavigationButtonを表示する
2. WHILE 表示中の画像が一覧の先頭である, THE ImageModal SHALL 「前へ」NavigationButtonを非活性状態で表示する
3. WHILE 表示中の画像が一覧の末尾である, THE ImageModal SHALL 「次へ」NavigationButtonを非活性状態で表示する
4. WHEN 一覧に画像が1件のみ存在する, THE ImageModal SHALL 両方のNavigationButtonを非活性状態で表示する

### 要件2: 前後画像への移動操作

**ユーザーストーリー:** 管理者として、ボタンクリックまたはキーボード操作で前後の画像に移動したい。これにより、素早く画像を確認できる。

#### 受け入れ基準

1. WHEN 「次へ」NavigationButtonがクリックされる, THE ImageModal SHALL 画像一覧の次の画像の詳細情報を表示する
2. WHEN 「前へ」NavigationButtonがクリックされる, THE ImageModal SHALL 画像一覧の前の画像の詳細情報を表示する
3. WHEN 右矢印キーが押される, THE ImageModal SHALL 画像一覧の次の画像の詳細情報を表示する
4. WHEN 左矢印キーが押される, THE ImageModal SHALL 画像一覧の前の画像の詳細情報を表示する
5. WHEN 画像が切り替わる, THE ImageModal SHALL 切り替え先の画像のメタデータ、タグ、レーティング情報を読み込んで表示する

### 要件3: ナビゲーション時の状態管理

**ユーザーストーリー:** 管理者として、画像を切り替えた際に正しい画像情報が表示されることを確認したい。これにより、誤った情報で操作することを防げる。

#### 受け入れ基準

1. WHEN 画像が切り替わる, THE ImageModal SHALL 前の画像の編集中状態（タグ入力中など）をリセットする
2. WHEN 画像が切り替わる, THE ImageModal SHALL 切り替え先の画像のレーティング情報をAPIから再取得する
3. THE ImageModal SHALL 現在の画像位置を「N / M」形式（Nは現在位置、Mは総数）で表示する
4. IF 画像切り替え中にAPIエラーが発生する, THEN THE ImageModal SHALL エラーメッセージを表示し、現在の画像の表示を維持する

### 要件4: モーダル表示の管理構造変更

**ユーザーストーリー:** 開発者として、モーダルの表示管理をImageListレベルに引き上げたい。これにより、画像一覧のコンテキスト（配列とインデックス）をモーダルに渡せるようになる。

#### 受け入れ基準

1. THE ImageList SHALL モーダルの表示状態と現在表示中の画像インデックスを管理する
2. WHEN ImageCardがクリックされる, THE ImageList SHALL 該当画像のインデックスでImageModalを表示する
3. THE ImageList SHALL 画像配列と現在のインデックスをImageModalに渡す
4. WHEN ImageModal内で画像が更新される（タグ追加、公開状態変更など）, THE ImageList SHALL 画像一覧を再読み込みする
