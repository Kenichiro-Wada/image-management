import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ImageGallery } from '../components/ImageGallery';
import { ImageModal } from '../components/ImageModal';
import { SearchFilter } from '../components/SearchFilter';
import { SortControl } from '../components/SortControl';
import { Slideshow } from '../components/Slideshow';
import { searchImages } from '../services/images';
import type { ImageMetadata, SearchFilters, SortField, SortDirection } from '../types';

export const GalleryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [searchResults, setSearchResults] = useState<ImageMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSlideshow, setIsSlideshow] = useState(false);
  const [displayImages, setDisplayImages] = useState<ImageMetadata[]>([]);
  const [sortBy, setSortBy] = useState<SortField>('capturedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // URLからタグパラメータを取得
  const initialTags = searchParams.getAll('tag');

  // URL にタグが指定されている場合、初期検索を実行
  useEffect(() => {
    if (initialTags.length > 0) {
      handleSearch({ tags: initialTags });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 画像をクリック
  const handleImageClick = (image: ImageMetadata, index: number) => {
    setSelectedImage(image);
    setSelectedIndex(index);
  };

  // モーダルを閉じる
  const handleCloseModal = () => {
    setSelectedImage(null);
  };

  // 前の画像へ
  const handlePrevious = () => {
    const newIndex = selectedIndex - 1;
    if (newIndex >= 0) {
      setSelectedIndex(newIndex);
      setSelectedImage(displayImages[newIndex]);
    }
  };

  // 次の画像へ
  const handleNext = () => {
    const newIndex = selectedIndex + 1;
    if (newIndex < displayImages.length) {
      setSelectedIndex(newIndex);
      setSelectedImage(displayImages[newIndex]);
    }
  };

  // 画像リストが更新されたとき
  const handleImagesChange = (newImages: ImageMetadata[]) => {
    if (!isSearching) {
      setDisplayImages(newImages);
    }
  };

  // 検索実行
  const handleSearch = useCallback(async (filters: SearchFilters) => {
    try {
      setIsSearching(true);
      const response = await searchImages(filters);
      setSearchResults(response.images);
      setDisplayImages(response.images);

      // URLパラメータを更新
      const params = new URLSearchParams();
      if (filters.tags && filters.tags.length > 0) {
        filters.tags.forEach(tag => params.append('tag', tag));
      }
      if (filters.keyword) {
        params.set('keyword', filters.keyword);
      }
      if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        params.set('dateTo', filters.dateTo);
      }
      setSearchParams(params, { replace: true });
    } catch (error) {
      console.error('検索に失敗しました:', error);
      alert('検索に失敗しました');
    }
  }, [setSearchParams]);

  // 検索クリア
  const handleClearSearch = () => {
    setIsSearching(false);
    setSearchResults([]);
    setSearchParams({}, { replace: true });
  };

  // スライドショー開始
  const handleStartSlideshow = () => {
    if (displayImages.length === 0) {
      alert('表示する画像がありません');
      return;
    }
    setIsSlideshow(true);
  };

  // スライドショー終了
  const handleCloseSlideshow = () => {
    setIsSlideshow(false);
  };

  // ソート変更
  const handleSortChange = (newSortBy: SortField, newSortDirection: SortDirection) => {
    setSortBy(newSortBy);
    setSortDirection(newSortDirection);
  };

  return (
    <div className="gallery-page">
      {/* ヘッダー */}
      <header className="gallery-header">
        <h1>画像ギャラリー</h1>
        <button className="btn-slideshow" onClick={handleStartSlideshow}>
          スライドショー
        </button>
      </header>

      {/* 検索フィルター */}
      <SearchFilter
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isSearching={isSearching}
        initialTags={initialTags}
      />

      {/* ソートコントロール */}
      <SortControl
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={handleSortChange}
      />

      {/* 画像ギャラリー */}
      <ImageGallery
        onImageClick={(image, index) => {
          handleImageClick(image, index);
        }}
        searchResults={searchResults}
        isSearching={isSearching}
        onImagesChange={handleImagesChange}
        sortBy={sortBy}
        sortDirection={sortDirection}
      />

      {/* 画像モーダル */}
      {selectedImage && !isSlideshow && (
        <ImageModal
          image={selectedImage}
          onClose={handleCloseModal}
          onPrevious={handlePrevious}
          onNext={handleNext}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex < displayImages.length - 1}
        />
      )}

      {/* スライドショー */}
      {isSlideshow && displayImages.length > 0 && (
        <Slideshow
          images={displayImages}
          initialIndex={selectedIndex}
          onClose={handleCloseSlideshow}
        />
      )}
    </div>
  );
};
