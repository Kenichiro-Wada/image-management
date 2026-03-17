# フロントエンドテスト（管理画面）

## セットアップ

テストに必要なパッケージをインストールします：

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

## テストの実行

```bash
# 全てのテストを実行
npm test

# 特定のテストファイルを実行
npm test -- ImageList.test.tsx

# ウォッチモードで実行
npm test -- --watch

# カバレッジを表示
npm test -- --coverage
```

## テストファイルの構成

```
src/
  components/
    __tests__/
      ImageList.test.tsx      # 画像一覧コンポーネントのテスト
      ImageUpload.test.tsx    # 画像アップロードコンポーネントのテスト
  test/
    setup.ts                  # テストセットアップ
    test-utils.tsx            # テストユーティリティ
```

## テストの実装状況

### 完了
- テスト環境のセットアップ
- テストファイルの骨組み作成

### TODO
- [ ] 6.3.1 認証コンポーネントのテスト
- [ ] 6.3.2 画像アップロードコンポーネントのテスト
- [ ] 6.3.3 画像一覧コンポーネントのテスト
- [ ] 6.3.4 検索・フィルタリングコンポーネントのテスト

各テストファイルには`TODO: 実装`コメントがあり、実装が必要な箇所を示しています。

## テストの書き方

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/test-utils';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('正しく表示される', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## 参考資料

- [Vitest](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Jest DOM](https://github.com/testing-library/jest-dom)
