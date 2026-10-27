import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { query } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const DEFAULT_LIMIT = 20; // 1回の読み込み件数（無限スクロール用）

// ソートパラメータの有効値
const VALID_SORT_FIELDS = ['capturedAt', 'uploadedAt', 'fileName', 'tag'];
const VALID_SORT_DIRECTIONS = ['asc', 'desc'];

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

  // ソートパラメータの取得（デフォルト: capturedAt, desc）
  const sortBy = event.queryStringParameters?.sortBy || 'capturedAt';
  const sortDirection = event.queryStringParameters?.sortDirection || 'desc';

  // ソートパラメータのバリデーション
  if (!VALID_SORT_FIELDS.includes(sortBy)) {
    throw new AppError('無効なsortByパラメータです', 400);
  }
  if (!VALID_SORT_DIRECTIONS.includes(sortDirection)) {
    throw new AppError('無効なsortDirectionパラメータです', 400);
  }

  try {
    // GSI2を使用して公開画像を全件取得
    const allItems: any[] = [];
    let lastKey: Record<string, any> | undefined;

    do {
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
        exclusiveStartKey: lastKey,
        scanIndexForward: false,
      });
      allItems.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // メモリ内ソート
    sortImages(allItems, sortBy, sortDirection);

    // オフセットベースカーソルページネーション
    const offset = cursorParam ? parseInt(Buffer.from(cursorParam, 'base64').toString('utf-8'), 10) : 0;
    const paged = allItems.slice(offset, offset + limit);
    const hasMore = offset + limit < allItems.length;

    const items = paged.map(formatImageItem);

    // 次のページのカーソルを生成
    let nextCursor: string | undefined;
    if (hasMore) {
      nextCursor = Buffer.from(String(offset + limit)).toString('base64');
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
 * 画像をソートする
 */
function sortImages(items: any[], sortBy: string, sortDirection: string): void {
  const dir = sortDirection === 'asc' ? 1 : -1;

  items.sort((a, b) => {
    let valA: any;
    let valB: any;

    switch (sortBy) {
      case 'fileName':
        valA = (a.fileName || '').toLowerCase();
        valB = (b.fileName || '').toLowerCase();
        break;
      case 'uploadedAt':
        valA = a.uploadedAt || '';
        valB = b.uploadedAt || '';
        break;
      case 'tag':
        valA = (a.tags && a.tags.length > 0) ? a.tags[0].toLowerCase() : '';
        valB = (b.tags && b.tags.length > 0) ? b.tags[0].toLowerCase() : '';
        break;
      case 'capturedAt':
      default:
        valA = a.capturedAt || a.uploadedAt || '';
        valB = b.capturedAt || b.uploadedAt || '';
        break;
    }

    if (valA < valB) return -1 * dir;
    if (valA > valB) return 1 * dir;
    return 0;
  });
}

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
