import type { ImageMetadata } from '../types';
import { StarRating } from './StarRating';

interface ImageCardProps {
  image: ImageMetadata;
  thumbnailUrl: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onOpenModal: () => void;
}

export const ImageCard = ({
  image,
  thumbnailUrl,
  selected,
  onSelect,
  onDelete,
  onUpdate,
  onOpenModal,
}: ImageCardProps) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`image-card ${selected ? 'selected' : ''}`}>
      {/* 選択チェックボックス */}
      <div className="card-checkbox">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* サムネイルクリックでモーダルを開く */}
      <div className="card-thumbnail" onClick={onOpenModal}>
        <img src={thumbnailUrl} alt={image.fileName} loading="lazy" />
        {image.isPublic && (
          <span className="public-badge">公開</span>
        )}
      </div>

      {/* 画像情報 */}
      <div className="card-info">
        <h3 className="card-title" title={image.fileName}>
          {image.fileName}
        </h3>
        
        <div className="card-meta">
          <span>{image.width} × {image.height}</span>
          <span>{formatFileSize(image.fileSize)}</span>
        </div>

        {image.tags.length > 0 && (
          <div className="card-tags">
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

        <div className="card-date">
          {formatDate(image.uploadedAt)}
        </div>

        {/* レーティング表示 */}
        {(image.averageRating !== undefined && image.averageRating > 0) && (
          <div className="card-rating">
            <StarRating
              rating={image.averageRating}
              readonly
              size="small"
              showCount={image.ratingCount}
            />
          </div>
        )}

        {/* Like数表示 */}
        {(image.likeCount !== undefined && image.likeCount > 0) && (
          <div className="card-likes">
            <span>❤️ {image.likeCount}</span>
          </div>
        )}
      </div>

      {/* アクション：詳細ボタンクリックでモーダルを開く */}
      <div className="card-actions">
        <button onClick={onOpenModal} title="詳細">
          👁️
        </button>
        <button onClick={onDelete} className="danger" title="削除">
          🗑️
        </button>
      </div>
    </div>
  );
};
