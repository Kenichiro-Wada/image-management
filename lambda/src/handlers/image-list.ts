import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withErrorHandler, successResponse, AppError } from '../middleware/error-handler';
import { query, scan } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';
const PAGE_SIZE = 50; // 1ページあたりの件数

/**
 * 画像一覧取得ハンドラー（管理画面用）
 * 
 * GET /api/admin/images
 * 
 * クエリパラメータ:
 * - page: ページ番号（1から開始、デフォルト: 1）
 * - userId: ユーザーIDでフィルタリング（オプション）
 * 
 * 機能:
 * - ページネーション処理（50件ずつ）
 * - ユーザー権限別フィルタリング
 *   - System_Admin / Image_Manager: 全画像表示
 *   - Regular_User: 自分の画像のみ表示
 */
export const handler = withErrorHandler(async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.info('画像一覧取得処理開始', {
    requestId: context.awsRequestId,
  });

  // クエリパラメータの取得
  const page = parseInt(event.queryStringParameters?.page || '1', 10);
  const filterUserId = event.queryStringParameters?.userId;
  const minRating = event.queryStringParameters?.minRating
    ? parseFloat(event.queryStringParameters.minRating)
    : undefined;
  const hasLikes = event.queryStringParameters?.hasLikes === 'true';
  const visibilityFilter = event.queryStringParameters?.visibility as 'public' | 'private' | undefined;

  // ページ番号のバリデーション
  if (page < 1) {
    throw new AppError('ページ番号は1以上である必要があります', 400);
  }

  // ユーザー情報の取得
  const currentUserId = event.requestContext.authorizer?.claims?.sub || 'test-user';
  
  // Cognitoグループの取得（文字列または配列で来る可能性に対応）
  const cognitoGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
  let groups: string[] = [];
  
  if (typeof cognitoGroups === 'string') {
    // 文字列の場合、JSON配列かどうかチェック
    try {
      if (cognitoGroups.startsWith('[')) {
        groups = JSON.parse(cognitoGroups);
      } else {
        // 単一の文字列の場合
        groups = [cognitoGroups];
      }
    } catch (error) {
      logger.warn('Cognitoグループのパースに失敗', { cognitoGroups, error });
      groups = [cognitoGroups];
    }
  } else if (Array.isArray(cognitoGroups)) {
    groups = cognitoGroups;
  }
  
  // ユーザーロールの判定
  let userRole = 'Regular_User';
  if (groups.includes('System_Admin')) {
    userRole = 'System_Admin';
  } else if (groups.includes('Image_Manager')) {
    userRole = 'Image_Manager';
  }

  logger.info('ユーザー情報', {
    currentUserId,
    userRole,
    groups,
    filterUserId,
  });

  // 権限チェック
  let targetUserId: string | undefined;

  if (userRole === 'System_Admin' || userRole === 'Image_Manager') {
    // システム管理者・画像管理者: 全画像またはフィルタ指定されたユーザーの画像
    targetUserId = filterUserId;
  } else {
    // 一般ユーザー: 自分の画像のみ
    targetUserId = currentUserId;
  }

  try {
    let items: any[] = [];
    let totalCount = 0;

    if (targetUserId) {
      const result = await getUserImages(targetUserId, page, minRating, hasLikes, visibilityFilter);
      items = result.items;
      totalCount = result.totalCount;
    } else {
      const result = await getAllImages(page, minRating, hasLikes, visibilityFilter);
      items = result.items;
      totalCount = result.totalCount;
    }

    // ページネーション情報の計算
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    logger.info('画像一覧取得完了', {
      page,
      totalCount,
      totalPages,
      itemCount: items.length,
    });

    return successResponse({
      images: items,
      pagination: {
        currentPage: page,
        pageSize: PAGE_SIZE,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    logger.error('画像一覧取得エラー', { error });
    throw error;
  }
});

/**
 * 特定ユーザーの画像を取得
 */
async function getUserImages(userId: string, page: number, minRating?: number, hasLikes?: boolean, visibilityFilter?: 'public' | 'private'): Promise<{
  items: any[];
  totalCount: number;
}> {
  const result = await query({
    tableName: IMAGES_TABLE,
    indexName: 'GSI1',
    keyConditionExpression: '#GSI1PK = :gsi1pk',
    expressionAttributeNames: {
      '#GSI1PK': 'GSI1PK',
    },
    expressionAttributeValues: {
      ':gsi1pk': `USER#${userId}`,
    },
    scanIndexForward: false,
  });

  let allItems = result.Items || [];

  // minRatingフィルター
  if (minRating !== undefined) {
    allItems = allItems.filter(item => (item.averageRating || 0) >= minRating);
  }

  // hasLikesフィルター
  if (hasLikes) {
    allItems = allItems.filter(item => (item.likeCount || 0) >= 1);
  }

  // 公開・非公開フィルター
  if (visibilityFilter === 'public') {
    allItems = allItems.filter(item => item.isPublic === true);
  } else if (visibilityFilter === 'private') {
    allItems = allItems.filter(item => item.isPublic !== true);
  }

  const totalCount = allItems.length;

  // ページネーション
  const startIndex = (page - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const items = allItems.slice(startIndex, endIndex);

  return {
    items: items.map(formatImageItem),
    totalCount,
  };
}

/**
 * 全画像を取得
 */
async function getAllImages(page: number, minRating?: number, hasLikes?: boolean, visibilityFilter?: 'public' | 'private'): Promise<{
  items: any[];
  totalCount: number;
}> {
  const result = await scan({
    tableName: IMAGES_TABLE,
  });

  let allItems = (result.Items || []).filter(item => item.SK === 'METADATA');

  // minRatingフィルター
  if (minRating !== undefined) {
    allItems = allItems.filter(item => (item.averageRating || 0) >= minRating);
  }

  // hasLikesフィルター
  if (hasLikes) {
    allItems = allItems.filter(item => (item.likeCount || 0) >= 1);
  }

  // 公開・非公開フィルター
  if (visibilityFilter === 'public') {
    allItems = allItems.filter(item => item.isPublic === true);
  } else if (visibilityFilter === 'private') {
    allItems = allItems.filter(item => item.isPublic !== true);
  }

  const totalCount = allItems.length;

  // アップロード日時で降順ソート
  allItems.sort((a, b) => {
    const dateA = new Date(a.uploadedAt).getTime();
    const dateB = new Date(b.uploadedAt).getTime();
    return dateB - dateA;
  });

  // ページネーション
  const startIndex = (page - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const items = allItems.slice(startIndex, endIndex);

  return {
    items: items.map(formatImageItem),
    totalCount,
  };
}

/**
 * 画像アイテムのフォーマット
 */
function formatImageItem(item: any): any {
  // imageIdが欠落している場合はPKから抽出
  const imageId = item.imageId || (item.PK ? item.PK.replace('IMAGE#', '') : '');
  return {
    imageId,
    fileName: item.fileName,
    fileSize: item.fileSize,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    uploadedAt: item.uploadedAt,
    capturedAt: item.capturedAt,
    tags: item.tags || [],
    isPublic: item.isPublic,
    ownerId: item.ownerId,
    ownerName: item.ownerName,
    s3Key: item.s3Key,
    thumbnailKeys: item.thumbnailKeys || {
      small: '',
      medium: '',
      large: '',
    },
    averageRating: item.averageRating || 0,
    ratingCount: item.ratingCount || 0,
    likeCount: item.likeCount || 0,
  };
}
