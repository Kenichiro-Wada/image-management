import { useState } from 'react';

interface StarRatingProps {
  rating: number;
  onRate?: (rating: number) => void;
  readonly?: boolean;
  size?: 'small' | 'medium' | 'large';
  showCount?: number;
}

export const StarRating = ({
  rating,
  onRate,
  readonly = false,
  size = 'medium',
  showCount,
}: StarRatingProps) => {
  const [hoverRating, setHoverRating] = useState(0);

  const sizeMap = { small: '16px', medium: '20px', large: '24px' };
  const fontSize = sizeMap[size];

  const handleClick = (star: number) => {
    if (!readonly && onRate) {
      onRate(star);
    }
  };

  return (
    <span className="star-rating" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hoverRating || rating);
        return (
          <span
            key={star}
            onClick={() => handleClick(star)}
            onMouseEnter={() => !readonly && setHoverRating(star)}
            onMouseLeave={() => !readonly && setHoverRating(0)}
            style={{
              cursor: readonly ? 'default' : 'pointer',
              fontSize,
              color: active ? '#f5a623' : '#ccc',
              transition: 'color 0.15s',
              userSelect: 'none',
            }}
            role={readonly ? undefined : 'button'}
            aria-label={`${star}星`}
          >
            ★
          </span>
        );
      })}
      {rating > 0 && (
        <span style={{ fontSize: size === 'small' ? '11px' : '13px', color: '#666', marginLeft: '4px' }}>
          {rating.toFixed(1)}
          {showCount !== undefined && <span> ({showCount})</span>}
        </span>
      )}
    </span>
  );
};
