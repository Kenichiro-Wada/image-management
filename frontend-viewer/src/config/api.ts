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
  itemsPerPage: 20, // 無限スクロール用
};

// スライドショー設定
export const SLIDESHOW_CONFIG = {
  intervalMs: 3000, // 3秒
};
