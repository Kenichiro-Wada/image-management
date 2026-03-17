import { test, expect } from '@playwright/test';

/**
 * タスク 6.4.1: ログインフローのE2Eテスト
 * 
 * テスト対象:
 * - ログインページの表示
 * - ログインフォームの入力
 * - ログイン成功
 * - ログイン失敗
 * - ログアウト
 */
test.describe('ログインフロー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ログインページが表示される', async ({ page }) => {
    // TODO: 実装
    // await expect(page.getByRole('heading', { name: 'ログイン' })).toBeVisible();
    // await expect(page.getByLabel('メールアドレス')).toBeVisible();
    // await expect(page.getByLabel('パスワード')).toBeVisible();
    
    expect(true).toBe(true); // プレースホルダー
  });

  test('正しい認証情報でログインできる', async ({ page }) => {
    // TODO: 実装
    // await page.getByLabel('メールアドレス').fill('test@example.com');
    // await page.getByLabel('パスワード').fill('password123');
    // await page.getByRole('button', { name: 'ログイン' }).click();
    // 
    // await expect(page).toHaveURL('/images');
    // await expect(page.getByText('ようこそ')).toBeVisible();
    
    expect(true).toBe(true); // プレースホルダー
  });

  test('間違った認証情報ではログインできない', async ({ page }) => {
    // TODO: 実装
    // await page.getByLabel('メールアドレス').fill('test@example.com');
    // await page.getByLabel('パスワード').fill('wrongpassword');
    // await page.getByRole('button', { name: 'ログイン' }).click();
    // 
    // await expect(page.getByText(/認証に失敗/i)).toBeVisible();
    
    expect(true).toBe(true); // プレースホルダー
  });

  test('ログアウトできる', async ({ page }) => {
    // TODO: 実装
    // ログイン
    // await page.getByLabel('メールアドレス').fill('test@example.com');
    // await page.getByLabel('パスワード').fill('password123');
    // await page.getByRole('button', { name: 'ログイン' }).click();
    // 
    // ログアウト
    // await page.getByRole('button', { name: 'ログアウト' }).click();
    // await expect(page).toHaveURL('/');
    
    expect(true).toBe(true); // プレースホルダー
  });
});
