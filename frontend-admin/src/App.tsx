import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import '@aws-amplify/ui-react/styles.css';
import { configureAmplify } from './config/amplify';
import { useAuth } from './hooks/useAuth';
import { ImagesPage } from './pages/ImagesPage';
import { SignUpPage } from './pages/SignUpPage';
import './App.css';

// Amplify設定を初期化
configureAmplify();

// 認証が必要なルートを保護するコンポーネント
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''}
      language="ja"
    >
      <Router>
        <Routes>
          <Route path="/signup" element={<SignUpPage />} />
          
          <Route path="/login" element={
            <Authenticator>
              {({ signOut, user }) => (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <h1>ログイン成功</h1>
                  <p>ようこそ、{user?.signInDetails?.loginId}さん</p>
                  <button onClick={signOut}>ログアウト</button>
                  <Navigate to="/images" replace />
                </div>
              )}
            </Authenticator>
          } />
          
          <Route path="/images" element={
            <ProtectedRoute>
              <ImagesPage />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={<Navigate to="/images" replace />} />
        </Routes>
      </Router>
    </GoogleReCaptchaProvider>
  );
}

export default App;
