import { useState, FormEvent } from 'react';
import type { SearchFilters } from '../types';

interface SearchFilterProps {
  onSearch: (filters: SearchFilters) => void;
  onClear: () => void;
  isSearching: boolean;
  initialTags?: string[];
}

export const SearchFilter = ({ onSearch, onClear, isSearching, initialTags = [] }: SearchFilterProps) => {
  const [keyword, setKeyword] = useState('');
  const [tags, setTags] = useState(initialTags.join(', '));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const filters: SearchFilters = {};

    if (keyword.trim()) {
      filters.keyword = keyword.trim();
    }

    if (tags.trim()) {
      filters.tags = tags.split(',').map((tag) => tag.trim()).filter((tag) => tag);
    }

    if (dateFrom) {
      filters.dateFrom = dateFrom;
    }

    if (dateTo) {
      filters.dateTo = dateTo;
    }

    onSearch(filters);
  };

  const handleClear = () => {
    setKeyword('');
    setTags('');
    setDateFrom('');
    setDateTo('');
    onClear();
  };

  return (
    <div className="search-filter">
      <form onSubmit={handleSubmit}>
        <div className="filter-row">
          <div className="filter-field">
            <label htmlFor="keyword">キーワード</label>
            <input
              id="keyword"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ファイル名・タグで検索"
            />
          </div>

          <div className="filter-field">
            <label htmlFor="tags">タグ</label>
            <input
              id="tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="カンマ区切りで複数指定"
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-field">
            <label htmlFor="dateFrom">撮影日（開始）</label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="filter-field">
            <label htmlFor="dateTo">撮影日（終了）</label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-actions">
          <button type="submit" className="btn-primary">
            検索
          </button>
          {isSearching && (
            <button type="button" className="btn-secondary" onClick={handleClear}>
              クリア
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
