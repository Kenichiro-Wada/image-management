import { useState, useEffect, useRef } from 'react';
import { getPublicImages } from '../services/images';
import { CLOUDFRONT_CONFIG } from '../config/api';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { LikeButton } from './LikeButton';
import type { ImageMetadata, SortField, SortDirection } from '../types';

interface ImageGalleryProps {
  onImageClick: (image: ImageMetadata, index: number) => void;
  searchResults?: ImageMetadata[];
  isSearching?: boolean;
  onImagesChange?: (images: ImageMetadata[]) => void;
  sortBy?: SortField;
  sortDirection?: SortDirection;
}

export const ImageGallery = ({ onImageClick, searchResults, isSearching, onImagesChange, sortBy, sortDirection }: ImageGalleryProps) => {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);
  // ソートパラメータの前回値を保持するref
  const prevSortRef = useRef({ sortBy, sortDirection });

  // 検索結果がある場合はそれを表示
  const displayImages = isSearching && searchResults ? searchResults : images;

  // 初回読み込み
  useEffect(() => {
    if (!isSearching && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadImages();
    }
  }, [isSearching]);

  // ソートパラメータ変更時にリセットして再取得
  useEffect(() => {
    // 初回読み込み前はスキップ
    if (!initialLoadDone.current) return;
    // 前回と同じ値ならスキップ
    if (prevSortRef.current.sortBy === sortBy && prevSortRef.current.sortDirection === sortDirection) return;

    prevSortRef.current = { sortBy, sortDirection };

    // 画像リストをクリアしカーソルをリセット
    setImages([]);
    setCursor(undefined);
    setHasMore(true);
    setIsLoading(true);
    setError(null);

    // 新しいソートパラメータで再取得
    const reload = async () => {
      try {
        const response = await getPublicImages(20, undefined, sortBy, sortDirection);
        setImages(response.images);
        setCursor(response.pagination.cursor);
        setHasMore(response.pagination.hasMore);
        if (onImagesChange) {
          onImagesChange(response.images);
        }
      } catch (err) {
        console.error('画像の読み込みに失敗しました:', err);
        setError('画像の読み込みに失敗しました');
      } finally {
        setIsLoading(false);
      }
    };
    reload();
  }, [sortBy, sortDirection]);

  // 画像を読み込む
  const loadImages = async () => {
    if (isLoading || !hasMore) {
      console.log('loadImages skipped - isLoading:', isLoading, 'hasMore:', hasMore);
      return;
    }

    console.log('loadImages starting...');
    setIsLoading(true);
    setError(null);

    try {
      const response = await getPublicImages(20, cursor, sortBy, sortDirection);
      console.log('API Response:', response);
      console.log('Current images count:', images.length);
      console.log('New images count:', response.images.length);
      
      setImages((prev) => {
        console.log('Before update - prev.length:', prev.length);
        
        // 重複を除去（imageIdでユニーク化）
        const existingIds = new Set(prev.map(img => img.imageId));
        const newImages = response.images.filter(img => !existingIds.has(img.imageId));
        
        const updated = [...prev, ...newImages];
        console.log('After update - updated.length:', updated.length);
        console.log('Updated images:', updated.map(img => img.imageId));
        
        // 親コンポーネントに通知
        if (onImagesChange) {
          onImagesChange(updated);
        }
        
        return updated;
      });
      setCursor(response.pagination.cursor);
      setHasMore(response.pagination.hasMore);
    } catch (err) {
      console.error('画像の読み込みに失敗しました:', err);
      setError('画像の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 無限スクロール
  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadImages,
    hasMore: hasMore && !isSearching,
    isLoading,
  });

  // サムネイルURLを取得
  const getThumbnailUrl = (image: ImageMetadata): string => {
    // サムネイルがない場合は元画像を使用
    if (!image.thumbnailKeys.medium) {
      return `${CLOUDFRONT_CONFIG.imagesURL}/${image.s3Key}`;
    }
    return `${CLOUDFRONT_CONFIG.thumbnailsURL}/${image.thumbnailKeys.medium}`;
  };

  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </div>
    );
  }

  return (
    <div className="image-gallery">
      <div className="gallery-grid">
        {displayImages.map((image, index) => (
          <div
            key={image.imageId}
            className="gallery-item"
            onClick={() => onImageClick(image, index)}
          >
            <img
              src={getThumbnailUrl(image)}
              alt={image.fileName}
              loading="lazy"
            />
            <div className="image-info">
              <p className="image-filename">{image.fileName}</p>
              {image.tags.length > 0 && (
                <div className="image-tags">
                  {image.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                  {image.tags.length > 3 && (
                    <span className="tag-more">+{image.tags.length - 3}</span>
                  )}
                </div>
              )}
              <div className="image-like">
                <LikeButton imageId={image.imageId} initialLikeCount={image.likeCount || 0} size="small" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 無限スクロール用のトリガー要素 */}
      {!isSearching && hasMore && (
        <div ref={loadMoreRef} className="load-more-trigger">
          {isLoading && <div className="loading-spinner">読み込み中...</div>}
        </div>
      )}

      {/* 検索結果が0件の場合 */}
      {isSearching && displayImages.length === 0 && !isLoading && (
        <div className="no-results">
          <p>検索結果が見つかりませんでした</p>
        </div>
      )}
    </div>
  );
};
