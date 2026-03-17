import { useState, useEffect } from 'react';
import { addLike, removeLike } from '../services/images';

interface LikeButtonProps {
  imageId: string;
  initialLikeCount: number;
  size?: 'small' | 'medium';
}

// ブラウザ固有のvisitorIdを取得・生成
const getVisitorId = (): string => {
  const key = 'viewer_visitor_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
};

// Like状態をlocalStorageで管理
const getLikedState = (imageId: string): boolean => {
  const liked = localStorage.getItem(`liked_${imageId}`);
  return liked === 'true';
};

const setLikedState = (imageId: string, liked: boolean) => {
  if (liked) {
    localStorage.setItem(`liked_${imageId}`, 'true');
  } else {
    localStorage.removeItem(`liked_${imageId}`);
  }
};

export const LikeButton = ({ imageId, initialLikeCount, size = 'medium' }: LikeButtonProps) => {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLiked(getLikedState(imageId));
  }, [imageId]);

  // initialLikeCountが変わったら同期
  useEffect(() => {
    setLikeCount(initialLikeCount);
  }, [initialLikeCount]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;

    const visitorId = getVisitorId();
    setLoading(true);

    try {
      if (liked) {
        const result = await removeLike(imageId, visitorId);
        setLiked(false);
        setLikedState(imageId, false);
        setLikeCount(result.likeCount);
      } else {
        const result = await addLike(imageId, visitorId);
        setLiked(true);
        setLikedState(imageId, true);
        setLikeCount(result.likeCount);
      }
    } catch (err) {
      console.error('Like操作に失敗:', err);
    } finally {
      setLoading(false);
    }
  };

  const fontSize = size === 'small' ? '14px' : '18px';
  const countSize = size === 'small' ? '11px' : '13px';

  return (
    <button
      className={`like-button ${liked ? 'liked' : ''}`}
      onClick={handleClick}
      disabled={loading}
      aria-label={liked ? 'いいねを取り消す' : 'いいね'}
      style={{ fontSize }}
    >
      <span className="like-icon">{liked ? '❤️' : '🤍'}</span>
      {likeCount > 0 && (
        <span className="like-count" style={{ fontSize: countSize }}>{likeCount}</span>
      )}
    </button>
  );
};
