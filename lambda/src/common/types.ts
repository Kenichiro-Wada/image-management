/**
 * 画像メタデータ
 */
export interface ImageMetadata {
  // プライマリキー
  PK: string; // "IMAGE#{imageId}"
  SK: string; // "METADATA"
  
  // 画像情報
  imageId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
  
  // メタデータ
  uploadedAt: string;
  capturedAt?: string;
  tags: string[];
  isPublic: boolean;
  
  // ユーザー情報
  ownerId: string;
  ownerName: string;
  
  // ストレージ情報
  s3Key: string;
  thumbnailKeys: {
    small: string;
    medium: string;
    large: string;
  };
  
  // GSI用
  GSI1PK: string; // "USER#{ownerId}"
  GSI1SK: string; // "{uploadedAt}#{imageId}"
  GSI2PK: string; // "PUBLIC#{isPublic}"
  GSI2SK: string; // "{capturedAt}#{imageId}"
}

/**
 * タグメタデータ
 */
export interface TagMetadata {
  // プライマリキー
  PK: string; // "TAG#{tagName}"
  SK: string; // "METADATA"
  
  // タグ情報
  tagName: string;
  usageCount: number;
  createdAt: string;
  lastUsedAt: string;
}

/**
 * ユーザーメタデータ
 */
export interface UserMetadata {
  // プライマリキー
  PK: string; // "USER#{userId}"
  SK: string; // "PROFILE"
  
  // ユーザー情報
  userId: string;
  email: string;
  displayName: string;
  role: 'SYSTEM_ADMIN' | 'IMAGE_MANAGER' | 'REGULAR_USER';
  
  // 統計情報
  imageCount: number;
  storageUsed: number;
  
  // 日時情報
  createdAt: string;
  lastLoginAt: string;
}

/**
 * ページネーション（オフセットベース）
 */
export interface OffsetPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * ページネーション（カーソルベース）
 */
export interface CursorPagination {
  cursor?: string;
  limit: number;
  hasMore: boolean;
}

/**
 * 画像アップロードリクエスト
 */
export interface ImageUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  capturedAt?: string;
  tags?: string[];
}

/**
 * 画像アップロードレスポンス
 */
export interface ImageUploadResponse {
  imageId: string;
  uploadUrl: string;
  expiresIn: number;
}

/**
 * 画像一覧レスポンス（管理画面用）
 */
export interface AdminImageListResponse {
  images: ImageMetadata[];
  pagination: OffsetPagination;
}

/**
 * 画像一覧レスポンス（公開画面用）
 */
export interface PublicImageListResponse {
  images: ImageMetadata[];
  pagination: CursorPagination;
}

/**
 * 環境変数
 */
export interface EnvironmentVariables {
  AWS_REGION: string;
  USER_POOL_ID: string;
  IMAGES_TABLE_NAME: string;
  TAGS_TABLE_NAME: string;
  USERS_TABLE_NAME: string;
  IMAGES_BUCKET_NAME: string;
  THUMBNAILS_BUCKET_NAME: string;
}
