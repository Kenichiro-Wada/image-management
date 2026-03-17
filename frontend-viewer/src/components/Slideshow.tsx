import { useState, useEffect, useCallback } from 'react';
import { CLOUDFRONT_CONFIG, SLIDESHOW_CONFIG } from '../config/api';
import type { ImageMetadata } from '../types';

interface SlideshowProps {
  images: ImageMetadata[];
  initialIndex?: number;
  onClose: () => void;
}

export const Slideshow = ({ images, initialIndex = 0, onClose }: SlideshowProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [intervalMs, setIntervalMs] = useState(SLIDESHOW_CONFIG.intervalMs);

  // 次の画像へ
  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  // 前の画像へ
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // 自動再生
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(goToNext, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, intervalMs, goToNext]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goToPrevious();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToPrevious, goToNext]);

  const currentImage = images[currentIndex];

  // 画像URLを取得
  const getImageUrl = (image: ImageMetadata): string => {
    return `${CLOUDFRONT_CONFIG.imagesURL}/${image.s3Key}`;
  };

  return (
    <div className="slideshow-overlay">
      <div className="slideshow-container">
        {/* ヘッダー */}
        <div className="slideshow-header">
          <div className="slideshow-info">
            <span className="slideshow-counter">
              {currentIndex + 1} / {images.length}
            </span>
            <span className="slideshow-filename">{currentImage.fileName}</span>
          </div>
          <button className="slideshow-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* 画像表示 */}
        <div className="slideshow-content">
          <button className="slideshow-nav slideshow-nav-prev" onClick={goToPrevious}>
            ‹
          </button>

          <div className="slideshow-image-container">
            <img src={getImageUrl(currentImage)} alt={currentImage.fileName} />
          </div>

          <button className="slideshow-nav slideshow-nav-next" onClick={goToNext}>
            ›
          </button>
        </div>

        {/* コントロール */}
        <div className="slideshow-controls">
          <button
            className="control-btn"
            onClick={() => setIsPlaying((prev) => !prev)}
          >
            {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
          </button>

          <div className="interval-control">
            <label htmlFor="interval">間隔:</label>
            <select
              id="interval"
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
            >
              <option value={1000}>1秒</option>
              <option value={2000}>2秒</option>
              <option value={3000}>3秒</option>
              <option value={5000}>5秒</option>
              <option value={10000}>10秒</option>
            </select>
          </div>
        </div>

        {/* サムネイル一覧 */}
        <div className="slideshow-thumbnails">
          {images.map((image, index) => (
            <div
              key={image.imageId}
              className={`thumbnail-item ${index === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(index)}
            >
              <img
                src={`${CLOUDFRONT_CONFIG.thumbnailsURL}/${image.thumbnailKeys.small}`}
                alt={image.fileName}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
