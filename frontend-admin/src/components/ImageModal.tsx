import { useState, useEffect } from 'react';
import { updateImageVisibility, addTag, deleteTag, downloadImage, getRating, setRating } from '../services/images';
import { CLOUDFRONT_CONFIG } from '../config/api';
import type { ImageMetadata } from '../types';
import { TagInput } from './TagInput';
import { StarRating } from './StarRating';
import { NavigationButton } from './NavigationButton';

interface ImageModalProps {
  image: ImageMetadata;
  onClose: () => void;
  onUpdate: () => void;
  images: ImageMetadata[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

export const ImageModal = ({ image: initialImage, onClose, onUpdate, images, currentIndex, onNavigate }: ImageModalProps) => {
  const [image, setImage] = useState<ImageMetadata>(initialImage);
  const [loading, setLoading] = useState(false);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [averageRating, setAverageRating] = useState(initialImage.averageRating || 0);
  const [ratingCount, setRatingCount] = useState(initialImage.ratingCount || 0);

  // ナビゲーション状態の算出
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  // 画像切り替え時の状態リセット
  useEffect(() => {
    const newImage = images[currentIndex];
    if (newImage) {
      setImage(newImage);
      setLoading(false);
      setMyRating(null);
      setAverageRating(newImage.averageRating || 0);
      setRatingCount(newImage.ratingCount || 0);
    }
  }, [currentIndex, images]);

  const imageUrl = `${CLOUDFRONT_CONFIG.imagesURL}/${image.s3Key}`;

  // レーティング情報を取得
  useEffect(() => {
    const loadRating = async () => {
      try {
        const ratingData = await getRating(image.imageId);
        setMyRating(ratingData.myRating);
        setAverageRating(ratingData.averageRating);
        setRatingCount(ratingData.ratingCount);
      } catch (err) {
        console.error('レーティング取得エラー:', err);
      }
    };
    loadRating();
  }, [image.imageId]);

  const handleRate = async (rating: number) => {
    try {
      setLoading(true);
      const result = await setRating(image.imageId, rating);
      setMyRating(result.myRating);
      setAverageRating(result.averageRating);
      setRatingCount(result.ratingCount);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'レーティングの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = async () => {
    try {
      setLoading(true);
      const updated = await updateImageVisibility(image.imageId, !image.isPublic);
      setImage(updated);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : '公開状態の変更に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = async (tagName: string) => {
    try {
      setLoading(true);
      const updated = await addTag(image.imageId, tagName);
      setImage(updated);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'タグの追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagName: string) => {
    try {
      setLoading(true);
      const updated = await deleteTag(image.imageId, tagName);
      setImage(updated);
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'タグの削除に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      setLoading(true);
      const blob = await downloadImage(image.imageId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = image.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ダウンロードに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 日本時間で保存されているため、Date変換せずそのまま整形して表示する
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '不明';
    // ISO 8601形式 "2024-01-15T10:30:00" → "2024/01/15 10:30:00"
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
    }
    return dateString;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // キーボードナビゲーション（ESC / 左右矢印キー）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, hasNext, hasPrev, currentIndex, onNavigate]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        <div className="modal-body">
          {/* 画像表示 */}
          <div className="modal-image">
            <NavigationButton direction="prev" disabled={!hasPrev} onClick={() => onNavigate(currentIndex - 1)} />
            <img src={imageUrl} alt={image.fileName} />
            <NavigationButton direction="next" disabled={!hasNext} onClick={() => onNavigate(currentIndex + 1)} />
            <div className="position-indicator">{currentIndex + 1} / {images.length}</div>
          </div>

          {/* 画像情報 */}
          <div className="modal-info">
            <h2>{image.fileName}</h2>

            {/* 基本情報 */}
            <div className="info-section">
              <h3>基本情報</h3>
              <dl>
                <dt>サイズ:</dt>
                <dd>{image.width} × {image.height}px</dd>
                
                <dt>ファイルサイズ:</dt>
                <dd>{formatFileSize(image.fileSize)}</dd>
                
                <dt>形式:</dt>
                <dd>{image.mimeType}</dd>
                
                <dt>アップロード日時:</dt>
                <dd>{formatDate(image.uploadedAt)}</dd>
                
                {image.capturedAt && (
                  <>
                    <dt>撮影日時:</dt>
                    <dd>{formatDate(image.capturedAt)}</dd>
                  </>
                )}
                
                <dt>所有者:</dt>
                <dd>{image.ownerName}</dd>
              </dl>
            </div>

            {/* EXIF情報 */}
            {(image.cameraMake || image.cameraModel || image.iso) && (
              <div className="info-section">
                <h3>撮影情報</h3>
                <dl>
                  {image.cameraMake && (
                    <>
                      <dt>カメラメーカー:</dt>
                      <dd>{image.cameraMake}</dd>
                    </>
                  )}
                  {image.cameraModel && (
                    <>
                      <dt>カメラモデル:</dt>
                      <dd>{image.cameraModel}</dd>
                    </>
                  )}
                  {image.iso && (
                    <>
                      <dt>ISO:</dt>
                      <dd>{image.iso}</dd>
                    </>
                  )}
                  {image.fNumber && (
                    <>
                      <dt>F値:</dt>
                      <dd>f/{image.fNumber}</dd>
                    </>
                  )}
                  {image.exposureTime && (
                    <>
                      <dt>露出時間:</dt>
                      <dd>{image.exposureTime}秒</dd>
                    </>
                  )}
                  {image.focalLength && (
                    <>
                      <dt>焦点距離:</dt>
                      <dd>{image.focalLength}mm</dd>
                    </>
                  )}
                </dl>
              </div>
            )}

            {/* GPS情報 */}
            {(image.latitude !== undefined && image.longitude !== undefined) && (
              <div className="info-section">
                <h3>位置情報</h3>
                <dl>
                  <dt>緯度:</dt>
                  <dd>{image.latitude.toFixed(6)}</dd>
                  <dt>経度:</dt>
                  <dd>{image.longitude.toFixed(6)}</dd>
                </dl>
              </div>
            )}

            {/* タグ管理 */}
            <div className="info-section">
              <h3>タグ</h3>
              <TagInput
                tags={image.tags}
                onAddTag={handleAddTag}
                onDeleteTag={handleDeleteTag}
                disabled={loading}
              />
            </div>

            {/* レーティング */}
            <div className="info-section">
              <h3>レーティング</h3>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#666' }}>あなたの評価: </span>
                <StarRating
                  rating={myRating || 0}
                  onRate={handleRate}
                  size="large"
                />
              </div>
              {ratingCount > 0 && (
                <div style={{ fontSize: '13px', color: '#666' }}>
                  平均: <StarRating rating={averageRating} readonly size="small" />
                  （{ratingCount}件の評価）
                </div>
              )}
            </div>

            {/* アクション */}
            <div className="modal-actions">
              <button
                onClick={handleToggleVisibility}
                disabled={loading}
                className={image.isPublic ? 'secondary' : 'primary'}
              >
                {image.isPublic ? '🔒 非公開にする' : '🌐 公開する'}
              </button>
              
              <button onClick={handleDownload} disabled={loading}>
                💾 ダウンロード
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
