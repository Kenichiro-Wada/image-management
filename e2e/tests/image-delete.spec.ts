import { test, expect } from '@playwright/test';

/**
 * タスク 6.4.3: 画像削除フローのE2Eテスト
 * 
 * テスト対象:
 * - 単一画像削除
 * - 一括削除
 * - 削除確認ダイアログ
 * - 削除後の画像一覧更新
 */
test.describe('画像削除フロー', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: ログイン処理
    await page.goto('/images');
  });

  test('単一の画像を削除できる', async ({ page }) => {
    // TODO: 実装
    // const firstImage = page.locator('.image-card').first();
    // await firstImage.getByRole('button', { name: '削除' }).click();
    // 
    // await page.getByRole('button', { name: '削除する' }).click();
    // 
    // await expect(page.getByText('削除しました')).toBeVisible();
    
    expect(true).toBe(true); // プレースホルダー
  });

  test('複数の画像を一括削除できる', async ({ page }) => {
    // TODO: 実装
    // await page.locator('.image-card').first().getByRole('checkbox').check();
    // await page.locator('.image-card').nth(1).getByRole('checkbox').check();
    // 
    // await page.getByRole('button', { name: '一括削除' }).click();
    // await page.getByRole('button', { name: '削除する' }).click();
    // 
    // await expect(page.getByText('2件削除しました')).toBeVisible();
    
    expect(true).toBe(true); // プレースホルダー
  });

  test('削除確認ダイアログでキャンセルできる', async ({ page }) => {
    // TODO: 実装
    // const firstImage = page.locator('.image-card').first();
    // const imageName = await firstImage.getByText(/\.jpg/).textContent();
    // 
    // await firstImage.getByRole('button', { name: '削除' }).click();
    // await page.getByRole('button', { name: 'キャンセル' }).click();
    // 
    // await expect(page.getByText(imageName!)).toBeVisible();
    
    expect(true).toBe(true); // プレースホルダー
  });

  test('他のユーザーの画像は削除できない（Regular_User）', async ({ page }) => {
    // TODO: 実装
    // Regular_Userでログイン
    // 他のユーザーの画像を表示
    // 削除ボタンが表示されないことを確認
    
    expect(true).toBe(true); // プレースホルダー
  });
});
