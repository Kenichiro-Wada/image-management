import { useEffect } from 'react';
import { CLOUDFRONT_CONFIG } from '../config/api';
import { LikeButton } from './LikeButton';
import type { ImageMetadata } from '../types';

interface ImageModalProps {
  image: ImageMetadata;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export const ImageModal = ({
  image,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: ImageModalProps) => {
  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrevious, onNext, hasPrevious, hasNext]);

  // 画像URLを取得
  const getImageUrl = (): string => {
    return `${CLOUDFRONT_CONFIG.imagesURL}/${image.s3Key}`;
  };

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 日時をフォーマット
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '不明';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        {/* ナビゲーションボタン */}
        {hasPrevious && onPrevious && (
          <button className="modal-nav modal-nav-prev" onClick={onPrevious}>
            ‹
          </button>
        )}
        {hasNext && onNext && (
          <button className="modal-nav modal-nav-next" onClick={onNext}>
            ›
          </button>
        )}

        <div className="modal-body">
          {/* 画像表示 */}
          <div className="modal-image-container">
            <img src={getImageUrl()} alt={image.fileName} />
          </div>

          {/* 画像情報 */}
          <div className="modal-info">
            <h2>{image.fileName}</h2>

            <div className="info-section">
              <h3>基本情報</h3>
              <dl>
                <dt>サイズ:</dt>
                <dd>{formatFileSize(image.fileSize)}</dd>
                <dt>解像度:</dt>
                <dd>{image.width} × {image.height} px</dd>
                <dt>アップロード日時:</dt>
                <dd>{formatDate(image.uploadedAt)}</dd>
                {image.capturedAt && (
                  <>
                    <dt>撮影日時:</dt>
                    <dd>{formatDate(image.capturedAt)}</dd>
                  </>
                )}
                <dt>投稿者:</dt>
                <dd>{image.ownerName}</dd>
              </dl>
            </div>

            {/* タグ */}
            {image.tags.length > 0 && (
              <div className="info-section">
                <h3>タグ</h3>
                <div className="tags-list">
                  {image.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Like */}
            <div className="info-section">
              <LikeButton imageId={image.imageId} initialLikeCount={image.likeCount || 0} size="medium" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
