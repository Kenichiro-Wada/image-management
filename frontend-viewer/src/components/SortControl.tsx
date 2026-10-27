import type { SortField, SortDirection } from '../types';

interface SortControlProps {
  sortBy: SortField;
  sortDirection: SortDirection;
  onSortChange: (sortBy: SortField, sortDirection: SortDirection) => void;
  disabled?: boolean;
}

// プルダウン選択肢
const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'capturedAt', label: '撮影日時' },
  { value: 'uploadedAt', label: 'アップロード日時' },
  { value: 'fileName', label: 'ファイル名' },
  { value: 'tag', label: 'タグ' },
];

// ラジオボタン選択肢
const SORT_DIRECTION_OPTIONS: { value: SortDirection; label: string }[] = [
  { value: 'asc', label: '昇順' },
  { value: 'desc', label: '降順' },
];

export const SortControl = ({ sortBy, sortDirection, onSortChange, disabled = false }: SortControlProps) => {
  // ソートフィールド変更ハンドラー
  const handleSortByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortChange(e.target.value as SortField, sortDirection);
  };

  // ソート方向変更ハンドラー
  const handleSortDirectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSortChange(sortBy, e.target.value as SortDirection);
  };

  return (
    <div className="sort-control">
      <div className="sort-field">
        <label htmlFor="sort-by">並び順</label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={handleSortByChange}
          disabled={disabled}
        >
          {SORT_FIELD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="sort-direction" disabled={disabled}>
        <legend>ソート方向</legend>
        {SORT_DIRECTION_OPTIONS.map((option) => (
          <label key={option.value} htmlFor={`sort-direction-${option.value}`}>
            <input
              type="radio"
              id={`sort-direction-${option.value}`}
              name="sort-direction"
              value={option.value}
              checked={sortDirection === option.value}
              onChange={handleSortDirectionChange}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
};
