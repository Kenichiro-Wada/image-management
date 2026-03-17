// API設定
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_ENDPOINT || '',
  timeout: 30000, // 30秒
};

// CloudFront URL
export const CLOUDFRONT_CONFIG = {
  imagesURL: import.meta.env.VITE_CLOUDFRONT_IMAGES_URL || '',
  thumbnailsURL: import.meta.env.VITE_CLOUDFRONT_THUMBNAILS_URL || '',
};

// ページネーション設定
export const PAGINATION_CONFIG = {
  itemsPerPage: 50,
};

// ファイルアップロード設定
export const UPLOAD_CONFIG = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  acceptedFormats: ['image/jpeg', 'image/jpg'],
  acceptedExtensions: ['.jpg', '.jpeg'],
};
