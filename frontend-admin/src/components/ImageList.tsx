import { useState, useEffect } from 'react';
import { getImages, deleteImage, bulkDeleteImages, bulkDownloadImages, bulkUpdateVisibility, bulkAddTags } from '../services/images';
import { CLOUDFRONT_CONFIG, PAGINATION_CONFIG } from '../config/api';
import type { ImageMetadata } from '../types';
import { ImageCard } from './ImageCard';
import { ImageModal } from './ImageModal';

export const ImageList = () => {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [showBulkTagDialog, setShowBulkTagDialog] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkTagLoading, setBulkTagLoading] = useState(false);
  const [minRatingFilter, setMinRatingFilter] = useState<number>(0);
  const [hasLikesFilter, setHasLikesFilter] = useState<boolean>(false);
  const [modalImageIndex, setModalImageIndex] = useState<number | null>(null);

  // モーダル表示状態管理
  const handleOpenModal = (index: number) => {
    if (images.length === 0) return;
    setModalImageIndex(index);
  };

  const handleCloseModal = () => {
    setModalImageIndex(null);
  };

  const handleNavigate = (index: number) => {
    if (images.length === 0) return;
    setModalImageIndex(Math.max(0, Math.min(index, images.length - 1)));
  };

  const loadImages = async (page: number = 1) => {
    try {
      setLoading(true);
      setError('');
      const response = await getImages(page, PAGINATION_CONFIG.itemsPerPage, minRatingFilter > 0 ? minRatingFilter : undefined, hasLikesFilter || undefined);
      setImages(response.images);
      setCurrentPage(response.pagination.currentPage);
      setTotalPages(response.pagination.totalPages);
      setTotal(response.pagination.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages(currentPage);
  }, [currentPage, minRatingFilter, hasLikesFilter]);

  const handleSelectImage = (imageId: string) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    setSelectedImages(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(images.map(img => img.imageId)));
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm('この画像を削除しますか？')) return;

    try {
      await deleteImage(imageId);
      await loadImages(currentPage);
      setSelectedImages(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedImages.size === 0) {
      alert('画像を選択してください');
      return;
    }

    if (!confirm(`${selectedImages.size}件の画像を削除しますか？`)) return;

    try {
      await bulkDeleteImages(Array.from(selectedImages));
      await loadImages(currentPage);
      setSelectedImages(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : '一括削除に失敗しました');
    }
  };

  const handleBulkDownload = async () => {
    if (selectedImages.size === 0) {
      alert('画像を選択してください');
      return;
    }

    const allIds = Array.from(selectedImages);
    const BATCH_SIZE = 50;

    // 大量画像の場合は事前にアナウンス
    if (allIds.length >= 20) {
      if (!confirm(`${allIds.length}件の画像をダウンロードします。\n枚数が多いため時間がかかる場合があります。続行しますか？`)) return;
    }

    try {
      // 50枚以下ならそのままダウンロード
      if (allIds.length <= BATCH_SIZE) {
        setDownloadProgress('ZIP生成中...');
        const downloadUrl = await bulkDownloadImages(allIds);
        // S3署名付きURLを直接開く（Content-Disposition: attachment付き）
        window.open(downloadUrl, '_blank');
      } else {
        // 50枚超の場合はバッチ分割
        const batches: string[][] = [];
        for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
          batches.push(allIds.slice(i, i + BATCH_SIZE));
        }

        for (let i = 0; i < batches.length; i++) {
          setDownloadProgress(`ZIP生成中... (${i + 1}/${batches.length})`);
          const downloadUrl = await bulkDownloadImages(batches[i]);
          window.open(downloadUrl, '_blank');
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      setDownloadProgress('');
    } catch (err) {
      setDownloadProgress('');
      alert(err instanceof Error ? err.message : '一括ダウンロードに失敗しました');
    }
  };

  const handleBulkPublish = async () => {
    if (selectedImages.size === 0) {
      alert('画像を選択してください');
      return;
    }

    if (!confirm(`${selectedImages.size}件の画像を公開しますか？`)) return;

    try {
      await bulkUpdateVisibility(Array.from(selectedImages), true);
      await loadImages(currentPage);
      setSelectedImages(new Set());
      alert(`${selectedImages.size}件の画像を公開しました`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '一括公開に失敗しました');
    }
  };

  const handleBulkUnpublish = async () => {
    if (selectedImages.size === 0) {
      alert('画像を選択してください');
      return;
    }

    if (!confirm(`${selectedImages.size}件の画像を非公開にしますか？`)) return;

    try {
      await bulkUpdateVisibility(Array.from(selectedImages), false);
      await loadImages(currentPage);
      setSelectedImages(new Set());
      alert(`${selectedImages.size}件の画像を非公開にしました`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '一括非公開に失敗しました');
    }
  };

  const handleBulkTag = async () => {
    if (!bulkTagInput.trim()) {
      alert('タグを入力してください');
      return;
    }

    const tags = bulkTagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (tags.length === 0) {
      alert('有効なタグを入力してください');
      return;
    }

    try {
      setBulkTagLoading(true);
      const result = await bulkAddTags(Array.from(selectedImages), tags);
      await loadImages(currentPage);
      setShowBulkTagDialog(false);
      setBulkTagInput('');
      setSelectedImages(new Set());

      if (result.failed > 0) {
        alert(`${result.success}件成功、${result.failed}件失敗しました`);
      } else {
        alert(`${result.success}件の画像にタグを追加しました`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '一括タグ付けに失敗しました');
    } finally {
      setBulkTagLoading(false);
    }
  };

  const getThumbnailUrl = (image: ImageMetadata): string => {
    if (image.thumbnailKeys.medium) {
      return `${CLOUDFRONT_CONFIG.thumbnailsURL}/${image.thumbnailKeys.medium}`;
    }
    return `${CLOUDFRONT_CONFIG.imagesURL}/${image.s3Key}`;
  };

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  if (error) {
    return <div className="error">エラー: {error}</div>;
  }

  return (
    <div className="image-list">
      <div className="list-header">
        <h2>画像一覧 ({total}件)</h2>
        
        <div className="list-filters">
          <label>
            最低レーティング:
            <select
              value={minRatingFilter}
              onChange={(e) => { setMinRatingFilter(Number(e.target.value)); setCurrentPage(1); }}
            >
              <option value={0}>すべて</option>
              <option value={1}>★1以上</option>
              <option value={2}>★2以上</option>
              <option value={3}>★3以上</option>
              <option value={4}>★4以上</option>
              <option value={5}>★5</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={hasLikesFilter}
              onChange={(e) => { setHasLikesFilter(e.target.checked); setCurrentPage(1); }}
            />
            Likeあり
          </label>
        </div>

        <div className="list-actions">
          <button onClick={handleSelectAll}>
            {selectedImages.size === images.length ? '全選択解除' : '全選択'}
          </button>
          
          {selectedImages.size > 0 && (
            <>
              <button onClick={handleBulkDownload} className="primary" disabled={!!downloadProgress}>
                {downloadProgress || `選択した${selectedImages.size}件をダウンロード`}
              </button>
              <button onClick={handleBulkPublish} className="success">
                選択した{selectedImages.size}件を公開
              </button>
              <button onClick={handleBulkUnpublish} className="warning">
                選択した{selectedImages.size}件を非公開
              </button>
              <button onClick={handleBulkDelete} className="danger">
                選択した{selectedImages.size}件を削除
              </button>
              <button onClick={() => setShowBulkTagDialog(true)} className="primary">
                選択した{selectedImages.size}件にタグ付け
              </button>
            </>
          )}
        </div>
      </div>

      {images.length === 0 ? (
        <div className="empty-state">
          <p>画像がありません</p>
        </div>
      ) : (
        <div className="image-grid">
          {images.map((image, index) => (
            <ImageCard
              key={image.imageId}
              image={image}
              thumbnailUrl={getThumbnailUrl(image)}
              selected={selectedImages.has(image.imageId)}
              onSelect={() => handleSelectImage(image.imageId)}
              onDelete={() => handleDelete(image.imageId)}
              onUpdate={() => loadImages(currentPage)}
              onOpenModal={() => handleOpenModal(index)}
            />
          ))}
        </div>
      )}

      {/* 画像詳細モーダル */}
      {modalImageIndex !== null && images[modalImageIndex] && (
        <ImageModal
          image={images[modalImageIndex]}
          images={images}
          currentIndex={modalImageIndex}
          onNavigate={handleNavigate}
          onClose={handleCloseModal}
          onUpdate={async () => {
            await loadImages(currentPage);
            // 再読み込み後にインデックスが範囲外になった場合のクランプ処理
            setModalImageIndex(prev => {
              if (prev === null) return null;
              return Math.max(0, Math.min(prev, images.length - 1));
            });
          }}
        />
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            前へ
          </button>
          
          <span>
            ページ {currentPage} / {totalPages}
          </span>
          
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            次へ
          </button>
        </div>
      )}

      {/* 一括タグ付けダイアログ */}
      {showBulkTagDialog && (
        <div className="modal-overlay" onClick={() => setShowBulkTagDialog(false)}>
          <div className="modal-content bulk-tag-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>一括タグ付け（{selectedImages.size}件）</h3>
            <p>追加するタグをカンマ区切りで入力してください</p>
            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="例: 風景, 夏, 海"
              disabled={bulkTagLoading}
              onKeyDown={(e) => { if (e.key === 'Enter') handleBulkTag(); }}
              autoFocus
            />
            <div className="dialog-actions">
              <button onClick={handleBulkTag} className="primary" disabled={bulkTagLoading || !bulkTagInput.trim()}>
                {bulkTagLoading ? '処理中...' : 'タグを追加'}
              </button>
              <button onClick={() => { setShowBulkTagDialog(false); setBulkTagInput(''); }} disabled={bulkTagLoading}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
