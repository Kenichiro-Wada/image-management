import axios, { AxiosInstance } from 'axios';
import { API_CONFIG } from '../config/api';

// Axiosインスタンスの作成
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

// レスポンスインターセプター（エラーハンドリング）
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // サーバーエラー
      console.error('API Error:', error.response.data);
    } else if (error.request) {
      // ネットワークエラー
      console.error('Network Error:', error.message);
    } else {
      // その他のエラー
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);
