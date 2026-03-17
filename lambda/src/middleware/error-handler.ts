import { APIGatewayProxyResult } from 'aws-lambda';

/**
 * カスタムエラークラス
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 認証エラー
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = '認証が必要です') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * 認可エラー
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'アクセス権限がありません') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * リソース未検出エラー
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'リソースが見つかりません') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * バリデーションエラー
 */
export class ValidationError extends AppError {
  constructor(message: string, public errors?: Record<string, string[]>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * 成功レスポンスを生成
 */
export const successResponse = (
  data: any,
  statusCode: number = 200
): APIGatewayProxyResult => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }),
  };
};

/**
 * エラーレスポンスを生成
 */
export const errorResponse = (
  error: Error | AppError,
  statusCode?: number
): APIGatewayProxyResult => {
  // AppErrorの場合はstatusCodeを使用
  const code =
    error instanceof AppError ? error.statusCode : statusCode || 500;
  
  // エラーコード
  const errorCode =
    error instanceof AppError ? error.code : 'INTERNAL_SERVER_ERROR';
  
  // エラーメッセージ
  const message = error.message || 'サーバーエラーが発生しました';
  
  // バリデーションエラーの詳細
  const errors =
    error instanceof ValidationError ? error.errors : undefined;
  
  // ログ出力
  console.error('Error:', {
    name: error.name,
    message: error.message,
    code: errorCode,
    statusCode: code,
    stack: error.stack,
  });
  
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: errorCode,
        message,
        errors,
      },
      timestamp: new Date().toISOString(),
    }),
  };
};

/**
 * エラーハンドリングラッパー
 * Lambda関数をラップして、エラーを自動的にキャッチして適切なレスポンスを返す
 */
export const withErrorHandler = <T extends (...args: any[]) => Promise<APIGatewayProxyResult>>(
  handler: T
): T => {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AppError) {
        return errorResponse(error);
      }
      
      // 予期しないエラー
      console.error('Unexpected error:', error);
      return errorResponse(
        new AppError('サーバーエラーが発生しました', 500)
      );
    }
  }) as T;
};
