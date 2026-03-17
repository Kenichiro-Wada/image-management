import { useNavigate } from 'react-router-dom';
import { ImageUpload } from '../components/ImageUpload';
import { ImageList } from '../components/ImageList';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../services/auth';

export const ImagesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('ログアウトに失敗しました:', error);
      alert('ログアウトに失敗しました');
    }
  };

  return (
    <div className="images-page">
      <header className="page-header">
        <h1>画像管理</h1>
        {user && (
          <div className="user-info">
            <span>{user.displayName}</span>
            <span className="user-role">{user.role}</span>
            <button onClick={handleLogout} className="logout-button">
              ログアウト
            </button>
          </div>
        )}
      </header>

      <main className="page-content">
        {/* アップロードセクション */}
        <section className="upload-section">
          <ImageUpload onUploadComplete={() => window.location.reload()} />
        </section>

        {/* 画像一覧セクション */}
        <section className="list-section">
          <ImageList />
        </section>
      </main>
    </div>
  );
};
