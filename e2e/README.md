# E2Eテスト

## セットアップ

Playwrightをインストールします：

```bash
npm init playwright@latest
```

または、既存のプロジェクトに追加：

```bash
npm install -D @playwright/test
npx playwright install
```

## テストの実行

```bash
# 全てのテストを実行
npx playwright test

# 特定のテストファイルを実行
npx playwright test login.spec.ts

# UIモードで実行（デバッグに便利）
npx playwright test --ui

# ヘッドモードで実行（ブラウザを表示）
npx playwright test --headed

# 特定のブラウザで実行
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## テストレポートの表示

```bash
npx playwright show-report
```

## テストファイルの構成

```
e2e/
  tests/
    login.spec.ts           # ログインフローのテスト
    image-upload.spec.ts    # 画像アップロードフローのテスト
    image-delete.spec.ts    # 画像削除フローのテスト
    viewer.spec.ts          # 公開画面閲覧フローのテスト
    slideshow.spec.ts       # スライドショーフローのテスト
  fixtures/                 # テスト用の画像ファイル
  playwright.config.ts      # Playwright設定
```

## テストの実装状況

### 完了
- テスト環境のセットアップ
- テストファイルの骨組み作成

### TODO
- [ ] 6.4.1 ログインフローのE2Eテスト
- [ ] 6.4.2 画像アップロードフローのE2Eテスト
- [ ] 6.4.3 画像削除フローのE2Eテスト
- [ ] 6.4.4 公開画面閲覧フローのE2Eテスト
- [ ] 6.4.5 スライドショーフローのE2Eテスト

各テストファイルには`TODO: 実装`コメントがあり、実装が必要な箇所を示しています。

## テストの書き方

```typescript
import { test, expect } from '@playwright/test';

test('基本的なテスト', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading')).toHaveText('Welcome');
});
```

## テスト用フィクスチャの準備

テスト用の画像ファイルを`fixtures/`ディレクトリに配置してください：

```
fixtures/
  test-image.jpg
  test-image1.jpg
  test-image2.jpg
  large-image.jpg
```

## 参考資料

- [Playwright](https://playwright.dev/)
- [Playwright Test](https://playwright.dev/docs/intro)
- [Best Practices](https://playwright.dev/docs/best-practices)
