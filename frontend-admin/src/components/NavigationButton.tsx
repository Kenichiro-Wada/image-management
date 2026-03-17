/** ナビゲーションボタンコンポーネント - モーダル内で前後の画像に移動するためのボタン */

interface NavigationButtonProps {
  direction: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}

export const NavigationButton = ({ direction, disabled, onClick }: NavigationButtonProps) => {
  // 方向に応じたアイコンとラベルを設定
  const isPrev = direction === 'prev';
  const icon = isPrev ? '◀' : '▶';
  const ariaLabel = isPrev ? '前の画像' : '次の画像';

  return (
    <button
      className={`nav-button nav-button-${direction}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      type="button"
    >
      {icon}
    </button>
  );
};
