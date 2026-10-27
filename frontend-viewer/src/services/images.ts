import { apiClient } from './api';
import type { ImageListResponse, SearchResponse, SearchFilters, SortField, SortDirection } from '../types';

// 公開画像一覧を取得（無限スクロール用）
export const getPublicImages = async (
  limit: number = 20,
  cursor?: string,
  sortBy?: SortField,
  sortDirection?: SortDirection
): Promise<ImageListResponse> => {
  const params: Record<string, string> = {
    limit: String(limit),
  };
  
  if (cursor) {
    params.cursor = cursor;
  }
  if (sortBy) {
    params.sortBy = sortBy;
  }
  if (sortDirection) {
    params.sortDirection = sortDirection;
  }

  const response = await apiClient.get<{ data: ImageListResponse }>('/api/viewer/images', {
    params,
  });
  
  return response.data.data;
};

// 画像を検索
export const searchImages = async (
  filters: SearchFilters,
  limit: number = 20,
  cursor?: string
): Promise<SearchResponse> => {
  const params: Record<string, string> = {
    limit: String(limit),
  };

  if (cursor) {
    params.cursor = cursor;
  }

  if (filters.keyword) {
    params.keyword = filters.keyword;
  }

  if (filters.tags && filters.tags.length > 0) {
    params.tags = filters.tags.join(',');
  }

  if (filters.dateFrom) {
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    params.dateTo = filters.dateTo;
  }

  const response = await apiClient.get<{ data: SearchResponse }>('/api/viewer/images/search', {
    params,
  });

  return response.data.data;
};

// CloudFront URLを生成
export const getImageUrl = (s3Key: string, cloudFrontUrl: string): string => {
  return `${cloudFrontUrl}/${s3Key}`;
};

// サムネイルURLを生成
export const getThumbnailUrl = (thumbnailKey: string, cloudFrontUrl: string): string => {
  return `${cloudFrontUrl}/${thumbnailKey}`;
};

// Likeレスポンス型
interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

// Like追加
export const addLike = async (imageId: string, visitorId: string): Promise<LikeResponse> => {
  const response = await apiClient.post<{ data: LikeResponse }>(`/api/public/images/${imageId}/like`, {
    visitorId,
  });
  return response.data.data;
};

// Like解除
export const removeLike = async (imageId: string, visitorId: string): Promise<LikeResponse> => {
  const response = await apiClient.delete<{ data: LikeResponse }>(`/api/public/images/${imageId}/like`, {
    params: { visitorId },
  });
  return response.data.data;
};
