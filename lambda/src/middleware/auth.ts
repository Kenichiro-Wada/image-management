import { APIGatewayProxyEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * ユーザーロール
 */
export enum UserRole {
  SYSTEM_ADMIN = 'System_Admin',
  IMAGE_MANAGER = 'Image_Manager',
  REGULAR_USER = 'Regular_User',
}

/**
 * 認証済みユーザー情報
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  groups: string[];
}

/**
 * JWKSクライアント（Cognito公開鍵取得用）
 */
const getJwksClient = () => {
  const userPoolId = process.env.USER_POOL_ID;
  const region = process.env.AWS_REGION || 'ap-northeast-1';
  
  if (!userPoolId) {
    throw new Error('USER_POOL_ID environment variable is not set');
  }
  
  return jwksClient({
    jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 600000, // 10分
  });
};

/**
 * JWTトークンを検証
 */
const verifyToken = async (token: string): Promise<any> => {
  const client = getJwksClient();
  
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        client.getSigningKey(header.kid, (err, key) => {
          if (err) {
            callback(err);
          } else {
            const signingKey = key?.getPublicKey();
            callback(null, signingKey);
          }
        });
      },
      {
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      }
    );
  });
};

/**
 * Authorizationヘッダーからトークンを抽出
 */
const extractToken = (event: APIGatewayProxyEvent): string | null => {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

/**
 * ユーザーのロールを取得
 */
const getUserRole = (groups: string[]): UserRole => {
  if (groups.includes(UserRole.SYSTEM_ADMIN)) {
    return UserRole.SYSTEM_ADMIN;
  }
  if (groups.includes(UserRole.IMAGE_MANAGER)) {
    return UserRole.IMAGE_MANAGER;
  }
  return UserRole.REGULAR_USER;
};

/**
 * 認証ミドルウェア
 * Cognitoトークンを検証し、ユーザー情報を抽出
 */
export const authenticate = async (
  event: APIGatewayProxyEvent
): Promise<AuthenticatedUser> => {
  const token = extractToken(event);
  
  if (!token) {
    throw new Error('認証トークンが見つかりません');
  }
  
  try {
    const decoded = await verifyToken(token);
    
    const groups = decoded['cognito:groups'] || [];
    const role = getUserRole(groups);
    
    return {
      userId: decoded.sub,
      email: decoded.email,
      role,
      groups,
    };
  } catch (error) {
    throw new Error('認証トークンが無効です');
  }
};

/**
 * 認可チェック: 必要なロールを持っているか確認
 */
export const authorize = (
  user: AuthenticatedUser,
  requiredRoles: UserRole[]
): boolean => {
  return requiredRoles.includes(user.role);
};

/**
 * 認可チェック: リソースの所有者か確認
 */
export const authorizeOwner = (
  user: AuthenticatedUser,
  resourceOwnerId: string
): boolean => {
  // System_Adminは全てのリソースにアクセス可能
  if (user.role === UserRole.SYSTEM_ADMIN) {
    return true;
  }
  
  // 所有者本人のみアクセス可能
  return user.userId === resourceOwnerId;
};

/**
 * 認可チェック: 画像管理権限を持っているか確認
 */
export const authorizeImageManagement = (
  user: AuthenticatedUser,
  resourceOwnerId?: string
): boolean => {
  // System_AdminとImage_Managerは全ての画像を管理可能
  if (
    user.role === UserRole.SYSTEM_ADMIN ||
    user.role === UserRole.IMAGE_MANAGER
  ) {
    return true;
  }
  
  // Regular_Userは自分の画像のみ管理可能
  if (resourceOwnerId) {
    return user.userId === resourceOwnerId;
  }
  
  return false;
};
