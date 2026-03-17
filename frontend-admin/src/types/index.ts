// ユーザー権限
export type UserRole = 'SYSTEM_ADMIN' | 'IMAGE_MANAGER' | 'REGULAR_USER';

// ユーザー情報
export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  imageCount: number;
  storageUsed: number;
  createdAt: string;
  lastLoginAt: string;
}

// 画像メタデータ
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
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  s3Key: string;
  thumbnailKeys: {
    small: string;
    medium: string;
    large: string;
  };
  folderPath?: string;
  // EXIF情報
  cameraMake?: string;
  cameraModel?: string;
  orientation?: number;
  latitude?: number;
  longitude?: number;
  iso?: number;
  fNumber?: number;
  exposureTime?: number;
  focalLength?: number;
  // レーティング情報
  averageRating?: number;
  ratingCount?: number;
  // Like情報
  likeCount?: number;
}

// 画像一覧レスポンス（管理画面用）
export interface ImageListResponse {
  images: ImageMetadata[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// アップロード結果
export interface UploadResult {
  filename: string;
  success: boolean;
  imageId?: string;
  s3Key?: string;
  metadata?: ImageMetadata;
  error?: string;
}

// アップロードレスポンス
export interface UploadResponse {
  message: string;
  results: UploadResult[];
  summary: {
    total: number;
    success: number;
    failure: number;
  };
}

// タグオートコンプリートレスポンス
export interface TagAutocompleteResponse {
  tags: Array<{
    tagName: string;
    usageCount: number;
  }>;
}

// 認証レスポンス
export interface AuthResponse {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

// エラーレスポンス
export interface ErrorResponse {
  error: {
    message: string;
    details?: unknown;
    timestamp: string;
  };
}
