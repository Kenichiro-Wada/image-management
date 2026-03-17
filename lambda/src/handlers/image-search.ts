import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../common/logger';

// DynamoDBクライアントの初期化
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const IMAGES_TABLE = process.env.IMAGES_TABLE || '';

/**
 * 画像検索・フィルタリングLambda関数
 * 
 * エンドポイント: GET /api/viewer/images/search
 * 
 * クエリパラメータ:
 * - keyword: 検索キーワード（ファイル名・タグで検索）
 * - tags: タグフィルター（カンマ区切り）
 * - dateFrom: 撮影日開始日（ISO 8601形式）
 * - dateTo: 撮影日終了日（ISO 8601形式）
 * - cursor: ページネーション用カーソル
 * - limit: 取得件数（デフォルト20、最大100）
 * 
 * レスポンス:
 * - images: 画像メタデータの配列
 * - nextCursor: 次のページのカーソル（存在する場合）
 * - hasMore: 次のページが存在するか
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('画像検索リクエスト受信', { queryStringParameters: event.queryStringParameters });

    // クエリパラメータの取得
    const keyword = event.queryStringParameters?.keyword || '';
    const tagsParam = event.queryStringParameters?.tags || '';
    const dateFrom = event.queryStringParameters?.dateFrom || '';
    const dateTo = event.queryStringParameters?.dateTo || '';
    const cursor = event.queryStringParameters?.cursor;
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || '20', 10),
      100
    );

    // タグフィルターの解析
    const tags = tagsParam ? tagsParam.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    logger.info('検索条件', { keyword, tags, dateFrom, dateTo, limit });

    // GSI2を使用して公開画像を取得
    const queryParams: any = {
      TableName: IMAGES_TABLE,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: {
        ':pk': 'PUBLIC#true',
      },
      Limit: limit + 1, // 次のページの有無を判定するため+1
      ScanIndexForward: false, // 撮影日時の降順
    };

    // 撮影日フィルター（開始日）
    if (dateFrom) {
      queryParams.KeyConditionExpression += ' AND GSI2SK >= :dateFrom';
      queryParams.ExpressionAttributeValues[':dateFrom'] = `${dateFrom}#`;
    }

    // 撮影日フィルター（終了日）
    if (dateTo) {
      if (!dateFrom) {
        queryParams.KeyConditionExpression += ' AND GSI2SK <= :dateTo';
      } else {
        queryParams.KeyConditionExpression += ' AND GSI2SK <= :dateTo';
      }
      // 終了日の最後の時刻まで含める
      queryParams.ExpressionAttributeValues[':dateTo'] = `${dateTo}T23:59:59.999Z#ZZZZZZZZ`;
    }

    // カーソルベースページネーション
    if (cursor) {
      try {
        const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        queryParams.ExclusiveStartKey = decodedCursor;
      } catch (error) {
        logger.error('カーソルのデコードに失敗', { error, cursor });
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            error: 'Invalid cursor',
            message: 'カーソルが無効です',
          }),
        };
      }
    }

    // DynamoDBクエリ実行
    const result = await docClient.send(new QueryCommand(queryParams));
    let items = result.Items || [];

    logger.info('DynamoDBクエリ結果', { count: items.length });

    // キーワードフィルター（ファイル名・タグで検索）
    if (keyword) {
      const lowerKeyword = keyword.toLowerCase();
      items = items.filter(item => {
        const fileNameMatch = item.fileName?.toLowerCase().includes(lowerKeyword);
        const tagsMatch = item.tags?.some((tag: string) => 
          tag.toLowerCase().includes(lowerKeyword)
        );
        return fileNameMatch || tagsMatch;
      });
    }

    // タグフィルター（すべてのタグが含まれる画像のみ）
    if (tags.length > 0) {
      items = items.filter(item => {
        const imageTags = item.tags || [];
        return tags.every(tag => 
          imageTags.some((imageTag: string) => 
            imageTag.toLowerCase() === tag.toLowerCase()
          )
        );
      });
    }

    // 次のページの有無を判定
    const hasMore = items.length > limit;
    if (hasMore) {
      items = items.slice(0, limit);
    }

    // 次のカーソルを生成
    let nextCursor: string | undefined;
    if (hasMore && result.LastEvaluatedKey) {
      nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    // レスポンスデータの整形
    const images = items.map(item => ({
      imageId: item.imageId,
      fileName: item.fileName,
      fileSize: item.fileSize,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
      uploadedAt: item.uploadedAt,
      capturedAt: item.capturedAt,
      tags: item.tags || [],
      s3Key: item.s3Key,
      thumbnailKeys: item.thumbnailKeys,
      ownerName: item.ownerName,
      likeCount: item.likeCount || 0,
    }));

    logger.info('検索結果', { count: images.length, hasMore });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: {
          images,
          nextCursor,
          hasMore,
          total: images.length,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    logger.error('画像検索エラー', { error });

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '画像検索中にエラーが発生しました',
        },
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
