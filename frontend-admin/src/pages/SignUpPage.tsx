import { useState } from 'react';
import { signUp, confirmSignUp, signIn } from 'aws-amplify/auth';
import { useNavigate } from 'react-router-dom';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import './SignUpPage.css';

export const SignUpPage = () => {
  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [step, setStep] = useState<'signup' | 'confirm'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // サインアップ処理
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // reCAPTCHA検証
    if (!executeRecaptcha) {
      setError('reCAPTCHAの初期化に失敗しました。ページを再読み込みしてください。');
      return;
    }

    // パスワード確認
    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    // パスワードポリシーチェック
    if (password.length < 8) {
      setError('パスワードは8文字以上である必要があります');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('パスワードには大文字を含める必要があります');
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError('パスワードには小文字を含める必要があります');
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError('パスワードには数字を含める必要があります');
      return;
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setError('パスワードには記号を含める必要があります');
      return;
    }

    setLoading(true);

    try {
      // reCAPTCHAトークンを取得
      const recaptchaToken = await executeRecaptcha('signup');
      
      // バックエンドでreCAPTCHAトークンを検証
      const verifyResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/verify-recaptcha`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: recaptchaToken,
          action: 'signup',
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error?.message || 'reCAPTCHA検証に失敗しました');
      }

      const verifyData = await verifyResponse.json();
      
      // スコアが低い場合は拒否（0.5以下はボットの可能性が高い）
      if (verifyData.data.score < 0.5) {
        setError('セキュリティチェックに失敗しました。しばらく時間をおいて再度お試しください。');
        return;
      }

      // Cognitoサインアップ
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name, // name属性を追加
          },
        },
      });

      setStep('confirm');
    } catch (err: any) {
      console.error('Sign up error:', err);
      if (err.name === 'UsernameExistsException') {
        setError('このメールアドレスは既に登録されています');
      } else if (err.name === 'InvalidPasswordException') {
        setError('パスワードがポリシーを満たしていません');
      } else {
        setError(err.message || 'サインアップに失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  // 確認コード検証処理
  const handleConfirmSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 確認コードを検証
      await confirmSignUp({
        username: email,
        confirmationCode,
      });

      // 自動ログイン
      await signIn({
        username: email,
        password,
      });

      // 管理画面にリダイレクト
      navigate('/');
    } catch (err: any) {
      console.error('Confirm sign up error:', err);
      if (err.name === 'CodeMismatchException') {
        setError('確認コードが正しくありません');
      } else if (err.name === 'ExpiredCodeException') {
        setError('確認コードの有効期限が切れています');
      } else {
        setError(err.message || '確認に失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  // 確認コード再送信
  const handleResendCode = async () => {
    setError('');
    setLoading(true);

    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            name, // name属性を追加
          },
        },
      });
      alert('確認コードを再送信しました');
    } catch (err: any) {
      console.error('Resend code error:', err);
      setError('確認コードの再送信に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-container">
        <h1>画像管理システム</h1>
        
        {step === 'signup' ? (
          <form onSubmit={handleSignUp} className="signup-form">
            <h2>新規登録</h2>
            
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="name">名前</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="山田 太郎"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="email">メールアドレス</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@example.com"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">パスワード</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="8文字以上、大小英数記号を含む"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="confirmPassword">パスワード（確認）</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="パスワードを再入力"
              />
            </div>
            
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? '登録中...' : '登録'}
            </button>
            
            <div className="form-footer">
              <p>
                既にアカウントをお持ちですか？{' '}
                <a href="/login">ログイン</a>
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmSignUp} className="signup-form">
            <h2>メールアドレスの確認</h2>
            
            <p className="info-message">
              {email} に確認コードを送信しました。
              <br />
              メールに記載された6桁のコードを入力してください。
            </p>
            
            {error && <div className="error-message">{error}</div>}
            
            <div className="form-group">
              <label htmlFor="confirmationCode">確認コード</label>
              <input
                type="text"
                id="confirmationCode"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                required
                placeholder="123456"
                maxLength={6}
              />
            </div>
            
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? '確認中...' : '確認'}
            </button>
            
            <div className="form-footer">
              <p>
                確認コードが届きませんか？{' '}
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="link-button"
                >
                  再送信
                </button>
              </p>
              <p>
                <a href="/login">ログイン画面に戻る</a>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
