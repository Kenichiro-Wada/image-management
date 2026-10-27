import { apiClient } from './api';
import type { ImageListResponse, ImageMetadata, UploadResponse } from '../types';

// 画像一覧を取得
export const getImages = async (page: number = 1, limit: number = 50, minRating?: number, hasLikes?: boolean, visibility?: 'public' | 'private'): Promise<ImageListResponse> => {
  const params: Record<string, any> = { page, limit };
  if (minRating && minRating > 0) {
    params.minRating = minRating;
  }
  if (hasLikes) {
    params.hasLikes = 'true';
  }
  if (visibility) {
    params.visibility = visibility;
  }
  const response = await apiClient.get<{ data: ImageListResponse }>('/api/admin/images', {
    params,
  });
  return response.data.data;
};

// 署名付きURLを取得してS3に直接アップロード（API Gatewayの10MB制限を回避）
export const uploadSingleImage = async (file: File): Promise<UploadResponse> => {
  // 1. 署名付きURLを取得
  const urlResponse = await apiClient.post<{ data: { uploadUrl: string; imageId: string; s3Key: string } }>(
    '/api/admin/images/upload-url',
    {
      filename: file.name,
      contentType: file.type,
    }
  );
  const { uploadUrl, imageId, s3Key } = urlResponse.data.data;

  // 2. S3に直接アップロード（署名付きURL使用）
  await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  // 3. メタデータ登録
  const confirmResponse = await apiClient.post<{ data: UploadResponse }>('/api/admin/images/confirm-upload', {
    imageId,
    s3Key,
    filename: file.name,
  });

  return confirmResponse.data.data;
};

// 画像を一括アップロード（後方互換性のため残す）
export const uploadImages = async (files: FileList, folderPath?: string): Promise<UploadResponse> => {
  // ファイルをbase64エンコード
  const filePromises = Array.from(files).map(async (file) => {
    return new Promise<{ filename: string; contentType: string; content: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve({
          filename: file.name,
          contentType: file.type,
          content: base64,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  });

  const encodedFiles = await Promise.all(filePromises);

  const response = await apiClient.post<{ data: UploadResponse }>('/api/admin/images/upload', {
    files: encodedFiles,
    folderPath,
  });
  
  return response.data.data;
};

// 画像を削除
export const deleteImage = async (imageId: string): Promise<void> => {
  await apiClient.delete(`/api/admin/images/${imageId}`);
};

// 画像を一括削除
export const bulkDeleteImages = async (imageIds: string[]): Promise<void> => {
  await apiClient.delete('/api/admin/images/bulk', {
    data: { imageIds },
  });
};

// 画像の公開状態を変更
export const updateImageVisibility = async (imageId: string, isPublic: boolean): Promise<ImageMetadata> => {
  const response = await apiClient.patch<ImageMetadata>(`/api/admin/images/${imageId}/visibility`, {
    isPublic,
  });
  return response.data;
};

// タグを追加
export const addTag = async (imageId: string, tagName: string): Promise<ImageMetadata> => {
  const response = await apiClient.post<ImageMetadata>(`/api/admin/images/${imageId}/tags`, {
    tagName,
  });
  return response.data;
};

// タグを削除
export const deleteTag = async (imageId: string, tagName: string): Promise<ImageMetadata> => {
  const response = await apiClient.delete<ImageMetadata>(`/api/admin/images/${imageId}/tags/${tagName}`);
  return response.data;
};

// タグのオートコンプリート
export const getTagSuggestions = async (prefix: string): Promise<string[]> => {
  const response = await apiClient.get<{ tags: Array<{ tagName: string }> }>('/api/admin/tags/autocomplete', {
    params: { prefix },
  });
  return response.data.tags.map(tag => tag.tagName);
};

// 画像をダウンロード
export const downloadImage = async (imageId: string): Promise<Blob> => {
  const response = await apiClient.get(`/api/admin/images/${imageId}/download`, {
    responseType: 'blob',
  });
  return response.data;
};

// 画像を一括ダウンロード
export const bulkDownloadImages = async (imageIds: string[]): Promise<string> => {
  const response = await apiClient.post<{ data: { downloadUrl: string } }>('/api/admin/images/download/bulk', 
    { imageIds },
  );
  return response.data.data.downloadUrl;
};

// 画像の公開状態を一括変更
export const bulkUpdateVisibility = async (imageIds: string[], isPublic: boolean): Promise<void> => {
  await apiClient.patch('/api/admin/images/visibility/bulk', {
    imageIds,
    isPublic,
  });
};

// 画像に一括タグ追加
export const bulkAddTags = async (imageIds: string[], tags: string[]): Promise<{ success: number; failed: number; failedImages: Array<{ imageId: string; reason: string }> }> => {
  const response = await apiClient.post<{ data: { success: number; failed: number; failedImages: Array<{ imageId: string; reason: string }> } }>('/api/admin/images/tags/bulk', {
    imageIds,
    tags,
  });
  return response.data.data;
};

// レーティングレスポンス型
interface RatingResponse {
  averageRating: number;
  ratingCount: number;
  myRating: number | null;
}

// レーティングを取得
export const getRating = async (imageId: string): Promise<RatingResponse> => {
  const response = await apiClient.get<{ data: RatingResponse }>(`/api/admin/images/${imageId}/rating`);
  return response.data.data;
};

// レーティングを追加・更新
export const setRating = async (imageId: string, rating: number): Promise<RatingResponse> => {
  const response = await apiClient.post<{ data: RatingResponse }>(`/api/admin/images/${imageId}/rating`, {
    rating,
  });
  return response.data.data;
};
