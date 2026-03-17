import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { scan } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const TAGS_TABLE = process.env.TAGS_TABLE || '';
const MAX_RESULTS = 20; // オートコンプリートの最大結果数

/**
 * タグオートコンプリートハンドラー
 * 
 * GET /api/admin/tags/autocomplete
 * 
 * クエリパラメータ:
 * - q: 検索クエリ（部分一致）
 * 
 * 機能:
 * - タグ名の部分一致検索
 * - 使用回数の多い順にソート
 * - 最大20件まで返す
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('タグオートコンプリート処理開始', {
    requestId: context.awsRequestId,
  });

  // クエリパラメータの取得
  const query = event.queryStringParameters?.q || '';

  // クエリが空の場合は、使用回数の多いタグを返す
  if (query.trim().length === 0) {
    const topTags = await getTopTags();
    return successResponse({
      tags: topTags,
      query: '',
    });
  }

  // クエリの正規化
  const normalizedQuery = query.trim().toLowerCase();

  logger.info('タグ検索', {
    query: normalizedQuery,
  });

  try {
    // タグテーブルをスキャン
    const result = await scan({
      tableName: TAGS_TABLE,
    });

    const allTags = result.Items || [];

    // タグ名で部分一致検索
    const matchedTags = allTags
      .filter(tag => {
        const tagName = tag.tagName.toLowerCase();
        return tagName.includes(normalizedQuery);
      })
      .map(tag => ({
        tagName: tag.tagName,
        usageCount: tag.usageCount || 0,
      }))
      .sort((a, b) => {
        // 使用回数の多い順にソート
        if (b.usageCount !== a.usageCount) {
          return b.usageCount - a.usageCount;
        }
        // 使用回数が同じ場合はタグ名でソート
        return a.tagName.localeCompare(b.tagName);
      })
      .slice(0, MAX_RESULTS);

    logger.info('タグオートコンプリート完了', {
      query: normalizedQuery,
      resultCount: matchedTags.length,
    });

    return successResponse({
      tags: matchedTags,
      query: normalizedQuery,
    });
  } catch (error) {
    logger.error('タグオートコンプリートエラー', { error, query: normalizedQuery });
    throw error;
  }
});

/**
 * 使用回数の多いタグを取得
 */
async function getTopTags(): Promise<Array<{ tagName: string; usageCount: number }>> {
  try {
    // タグテーブルをスキャン
    const result = await scan({
      tableName: TAGS_TABLE,
    });

    const allTags = result.Items || [];

    // 使用回数の多い順にソート
    const topTags = allTags
      .map(tag => ({
        tagName: tag.tagName,
        usageCount: tag.usageCount || 0,
      }))
      .sort((a, b) => {
        // 使用回数の多い順にソート
        if (b.usageCount !== a.usageCount) {
          return b.usageCount - a.usageCount;
        }
        // 使用回数が同じ場合はタグ名でソート
        return a.tagName.localeCompare(b.tagName);
      })
      .slice(0, MAX_RESULTS);

    return topTags;
  } catch (error) {
    logger.error('トップタグ取得エラー', { error });
    return [];
  }
}
