import { useState, useEffect } from 'react';
import { Hub } from 'aws-amplify/utils';
import { getCurrentUserInfo, checkAuthStatus } from '../services/auth';
import type { User } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const loadUser = async () => {
    try {
      setLoading(true);
      const isAuth = await checkAuthStatus();
      setIsAuthenticated(isAuth);

      if (isAuth) {
        const userInfo = await getCurrentUserInfo();
        setUser(userInfo);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('ユーザー情報の読み込みエラー:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();

    // Amplify Hubでauth eventsをリッスン
    const hubListener = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
          loadUser();
          break;
        case 'signedOut':
          setUser(null);
          setIsAuthenticated(false);
          break;
        case 'tokenRefresh':
          loadUser();
          break;
      }
    });

    return () => hubListener();
  }, []);

  return {
    user,
    loading,
    isAuthenticated,
    refetch: loadUser,
  };
};
