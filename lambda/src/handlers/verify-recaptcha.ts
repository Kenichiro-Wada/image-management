import { APIGatewayProxyHandler } from 'aws-lambda';

/**
 * Google reCAPTCHA APIのレスポンス型
 */
interface RecaptchaVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * reCAPTCHA v3トークン検証API
 * 
 * フロントエンドから送信されたreCAPTCHAトークンをGoogleのAPIで検証する
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('Verify reCAPTCHA request:', JSON.stringify(event, null, 2));

  // CORSヘッダー
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  };

  // OPTIONSリクエスト（プリフライト）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // リクエストボディをパース
    const body = JSON.parse(event.body || '{}');
    const { token, action } = body;

    // バリデーション
    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: {
            message: 'reCAPTCHAトークンが必要です',
          },
        }),
      };
    }

    // reCAPTCHA Secret Keyを環境変数から取得
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error('RECAPTCHA_SECRET_KEY is not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: {
            message: 'サーバー設定エラー',
          },
        }),
      };
    }

    // GoogleのreCAPTCHA APIで検証
    const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const verifyData = await verifyResponse.json() as RecaptchaVerifyResponse;

    console.log('reCAPTCHA verification result:', verifyData);

    // 検証結果をチェック
    if (!verifyData.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: {
            message: 'reCAPTCHA検証に失敗しました',
            details: verifyData['error-codes'],
          },
        }),
      };
    }

    // アクションが一致するかチェック
    if (action && verifyData.action !== action) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: {
            message: 'reCAPTCHAアクションが一致しません',
          },
        }),
      };
    }

    // スコアをチェック（0.0 - 1.0、1.0が最も人間らしい）
    const score = verifyData.score || 0;
    const threshold = 0.5; // 閾値（0.5以下はボットの可能性が高い）

    if (score < threshold) {
      console.warn(`Low reCAPTCHA score: ${score}`);
    }

    // 成功レスポンス
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          score,
          action: verifyData.action,
          challenge_ts: verifyData.challenge_ts,
          hostname: verifyData.hostname,
        },
      }),
    };
  } catch (error) {
    console.error('Error verifying reCAPTCHA:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: {
          message: 'reCAPTCHA検証中にエラーが発生しました',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
    };
  }
};
