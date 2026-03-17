import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { API_CONFIG } from '../config/api';
import type { ErrorResponse } from '../types';

// Axiosインスタンスの作成
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_CONFIG.baseURL,
    timeout: API_CONFIG.timeout,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // リクエストインターセプター（認証トークンを追加）
  client.interceptors.request.use(
    async (config) => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('認証トークンの取得に失敗しました:', error);
      }
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // レスポンスインターセプター（エラーハンドリング）
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ErrorResponse>) => {
      if (error.response) {
        // サーバーからのエラーレスポンス
        const errorMessage = error.response.data?.error?.message || 'エラーが発生しました';
        console.error('APIエラー:', errorMessage);
        return Promise.reject(new Error(errorMessage));
      } else if (error.request) {
        // リクエストは送信されたがレスポンスがない
        console.error('ネットワークエラー:', error.message);
        return Promise.reject(new Error('ネットワークエラーが発生しました'));
      } else {
        // リクエストの設定中にエラーが発生
        console.error('リクエストエラー:', error.message);
        return Promise.reject(error);
      }
    }
  );

  return client;
};

export const apiClient = createApiClient();
