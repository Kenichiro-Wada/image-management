import { useState, useEffect, useRef } from 'react';
import { getTagSuggestions } from '../services/images';

interface TagInputProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onDeleteTag: (tag: string) => void;
  disabled?: boolean;
}

export const TagInput = ({ tags, onAddTag, onDeleteTag, disabled }: TagInputProps) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // オートコンプリート
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (inputValue.length >= 2) {
        try {
          const results = await getTagSuggestions(inputValue);
          // 既存のタグを除外
          const filtered = results.filter(tag => !tags.includes(tag));
          setSuggestions(filtered);
          setShowSuggestions(filtered.length > 0);
        } catch (err) {
          console.error('タグ候補の取得エラー:', err);
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [inputValue, tags]);

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    
    if (!trimmedTag) return;
    
    if (tags.includes(trimmedTag)) {
      alert('このタグは既に追加されています');
      return;
    }

    if (trimmedTag.length > 50) {
      alert('タグは50文字以内で入力してください');
      return;
    }

    onAddTag(trimmedTag);
    setInputValue('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (tag: string) => {
    handleAddTag(tag);
    inputRef.current?.focus();
  };

  return (
    <div className="tag-input">
      {/* 既存のタグ */}
      <div className="tags-list">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button
              onClick={() => onDeleteTag(tag)}
              disabled={disabled}
              className="tag-remove"
              title="削除"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* 入力フィールド */}
      <div className="tag-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="タグを入力..."
          disabled={disabled}
          maxLength={50}
        />
        <button
          onClick={() => handleAddTag(inputValue)}
          disabled={disabled || !inputValue.trim()}
        >
          追加
        </button>

        {/* オートコンプリート候補 */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="tag-suggestions">
            {suggestions.map((tag) => (
              <div
                key={tag}
                className="tag-suggestion"
                onClick={() => handleSuggestionClick(tag)}
              >
                {tag}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
