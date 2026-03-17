// 画像メタデータ（ビューアー用）
export interface ImageMetadata {
  imageId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
  uploadedAt: string;
  capturedAt?: string;
  tags: string[];
  ownerName: string;
  s3Key: string;
  thumbnailKeys: {
    small: string;
    medium: string;
    large: string;
  };
  likeCount?: number;
}

// 画像一覧レスポンス（ビューアー用）
export interface ImageListResponse {
  images: ImageMetadata[];
  pagination: {
    limit: number;
    cursor?: string;
    hasMore: boolean;
  };
}

// 検索レスポンス
export interface SearchResponse {
  images: ImageMetadata[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
}

// 検索フィルター
export interface SearchFilters {
  keyword?: string;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

// エラーレスポンス
export interface ErrorResponse {
  error: {
    message: string;
    details?: unknown;
    timestamp: string;
  };
}
