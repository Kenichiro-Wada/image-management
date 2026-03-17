import { signIn, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { apiClient } from './api';
import type { User } from '../types';

// ログイン
export const login = async (email: string, password: string): Promise<void> => {
  try {
    await signIn({
      username: email,
      password,
    });
  } catch (error) {
    console.error('ログインエラー:', error);
    throw error;
  }
};

// ログアウト
export const logout = async (): Promise<void> => {
  try {
    await signOut();
  } catch (error) {
    console.error('ログアウトエラー:', error);
    throw error;
  }
};

// 現在のユーザー情報を取得
export const getCurrentUserInfo = async (): Promise<User | null> => {
  try {
    await getCurrentUser();
    
    // バックエンドからユーザー詳細情報を取得
    const response = await apiClient.get<User>('/api/admin/auth/user');
    return response.data;
  } catch (error) {
    console.error('ユーザー情報の取得エラー:', error);
    return null;
  }
};

// 認証状態を確認
export const checkAuthStatus = async (): Promise<boolean> => {
  try {
    const session = await fetchAuthSession();
    return !!session.tokens?.idToken;
  } catch (error) {
    return false;
  }
};
