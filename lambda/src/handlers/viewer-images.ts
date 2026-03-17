import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { query } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const DEFAULT_LIMIT = 20; // 1回の読み込み件数（無限スクロール用）

/**
 * 公開画像一覧取得ハンドラー（ビューアー用）
 * 
 * GET /api/viewer/images
 * 
 * クエリパラメータ:
 * - limit: 1回の読み込み件数（デフォルト: 20）
 * - cursor: 次のページのカーソル（オプション）
 * 
 * 機能:
 * - カーソルベースページネーション（無限スクロール対応）
 * - 公開画像のみフィルタリング（isPublic = true）
 * - 撮影日時の降順でソート
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('公開画像一覧取得処理開始', {
    requestId: context.awsRequestId,
  });

  // クエリパラメータの取得
  const limit = parseInt(event.queryStringParameters?.limit || String(DEFAULT_LIMIT), 10);
  const cursorParam = event.queryStringParameters?.cursor;

  // limitのバリデーション
  if (limit < 1 || limit > 100) {
    throw new AppError('limitは1〜100の範囲で指定してください', 400);
  }

  try {
    // カーソルのデコード
    let exclusiveStartKey: Record<string, any> | undefined;
    if (cursorParam) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf-8'));
      } catch (error) {
        throw new AppError('無効なカーソルです', 400);
      }
    }

    // GSI2を使用して公開画像を取得
    const result = await query({
      tableName: IMAGES_TABLE,
      indexName: 'GSI2',
      keyConditionExpression: '#GSI2PK = :gsi2pk',
      expressionAttributeNames: {
        '#GSI2PK': 'GSI2PK',
      },
      expressionAttributeValues: {
        ':gsi2pk': 'PUBLIC#true',
      },
      limit,
      exclusiveStartKey,
      scanIndexForward: false, // 降順（新しい順）
    });

    const items = (result.Items || []).map(formatImageItem);

    // 次のページのカーソルを生成
    let nextCursor: string | undefined;
    if (result.LastEvaluatedKey) {
      nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    logger.info('公開画像一覧取得完了', {
      itemCount: items.length,
      hasMore: !!nextCursor,
    });

    return successResponse({
      images: items,
      pagination: {
        limit,
        cursor: nextCursor,
        hasMore: !!nextCursor,
      },
    });
  } catch (error) {
    logger.error('公開画像一覧取得エラー', { error });
    throw error;
  }
});

/**
 * 画像アイテムのフォーマット
 */
function formatImageItem(item: any): any {
  return {
    imageId: item.imageId,
    fileName: item.fileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    uploadedAt: item.uploadedAt,
    capturedAt: item.capturedAt,
    tags: item.tags || [],
    ownerName: item.ownerName,
    s3Key: item.s3Key,
    thumbnailKeys: item.thumbnailKeys || {
      small: '',
      medium: '',
      large: '',
    },
    likeCount: item.likeCount || 0,
  };
}
