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

  // 日本時間で保存されているため、Date変換せずそのまま整形して表示する
  const formatDate = (dateString?: string): string => {
    if (!dateString) return '不明';
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}`;
    }
    return dateString;
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
