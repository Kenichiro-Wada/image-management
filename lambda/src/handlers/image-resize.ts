import { S3Event, Context } from 'aws-lambda';
import sharp from 'sharp';
import { getObject, putObject } from '../common/s3-client';
import { update } from '../common/dynamodb-client';
import { logger } from '../common/logger';

// 環境変数
const THUMBNAILS_BUCKET = process.env.THUMBNAILS_BUCKET || '';
const IMAGES_TABLE = process.env.IMAGES_TABLE || '';

// サムネイルサイズ定義
const THUMBNAIL_SIZES = {
  small: { width: 150, height: 150 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 600 },
} as const;

type ThumbnailSize = keyof typeof THUMBNAIL_SIZES;

/**
 * 画像リサイズハンドラー
 * 
 * S3イベントトリガー: 画像アップロード時に自動実行
 * 
 * 機能:
 * - Sharp.jsを使用した画像リサイズ
 * - 3種類のサムネイル生成（small, medium, large）
 * - サムネイルS3保存
 * - DynamoDBメタデータ更新
 */
export const handler = async (
  event: S3Event,
  context: Context
): Promise<void> => {
  logger.info('画像リサイズ処理開始', {
    requestId: context.awsRequestId,
    recordCount: event.Records.length,
  });

  try {
    // 各S3イベントレコードを処理
    for (const record of event.Records) {
      try {
        // S3イベント情報の取得
        const sourceBucket = record.s3.bucket.name;
        const sourceKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

        logger.info('画像リサイズ処理対象', {
          sourceBucket,
          sourceKey,
        });

        // 画像IDの抽出（S3キー: images/{userId}/{imageId}/{filename}）
        const keyParts = sourceKey.split('/');
        if (keyParts.length < 3 || keyParts[0] !== 'images') {
          logger.warn('無効なS3キー形式、スキップします', { sourceKey });
          continue;
        }

        const userId = keyParts[1];
        const imageId = keyParts[2];

        // S3から元画像を取得
        const originalImage = await getObject({
          bucket: sourceBucket,
          key: sourceKey,
        });

        logger.info('元画像取得完了', {
          imageId,
          contentType: originalImage.ContentType,
          size: originalImage.ContentLength,
        });

        // 画像情報の取得
        const imageMetadata = await sharp(originalImage.Body).metadata();
        const { width: rawWidth, height: rawHeight, format, orientation } = imageMetadata;

        // Exif orientationに基づいてwidth/heightを補正（90度/270度回転の場合は入れ替え）
        const isRotated = orientation && (orientation >= 5 && orientation <= 8);
        const width = isRotated ? rawHeight : rawWidth;
        const height = isRotated ? rawWidth : rawHeight;

        logger.info('画像メタデータ取得完了', {
          imageId,
          width,
          height,
          format,
          orientation,
        });

        // サムネイルキーを格納するオブジェクト
        const thumbnailKeys: Record<ThumbnailSize, string> = {
          small: '',
          medium: '',
          large: '',
        };

        // 各サイズのサムネイルを生成
        for (const [sizeName, dimensions] of Object.entries(THUMBNAIL_SIZES)) {
          const size = sizeName as ThumbnailSize;

          try {
            // サムネイル生成
            const thumbnail = await generateThumbnail(
              originalImage.Body,
              dimensions.width,
              dimensions.height
            );

            // サムネイルS3キーの生成
            const thumbnailKey = `thumbnails/${userId}/${imageId}/${size}/${keyParts[3]}`;

            // S3へのアップロード
            await putObject({
              bucket: THUMBNAILS_BUCKET,
              key: thumbnailKey,
              body: thumbnail,
              contentType: originalImage.ContentType || 'image/jpeg',
              metadata: {
                originalKey: sourceKey,
                thumbnailSize: size,
                imageId,
              },
            });

            thumbnailKeys[size] = thumbnailKey;

            logger.info('サムネイル生成完了', {
              imageId,
              size,
              thumbnailKey,
              thumbnailSize: thumbnail.length,
            });
          } catch (error) {
            logger.error('サムネイル生成失敗', {
              imageId,
              size,
              error,
            });
            // エラーが発生しても他のサイズの生成は続行
          }
        }

        // DynamoDBメタデータ更新
        await update({
          tableName: IMAGES_TABLE,
          key: {
            PK: `IMAGE#${imageId}`,
            SK: 'METADATA',
          },
          updateExpression: 'SET #thumbnailKeys = :thumbnailKeys, #width = :width, #height = :height',
          expressionAttributeNames: {
            '#thumbnailKeys': 'thumbnailKeys',
            '#width': 'width',
            '#height': 'height',
          },
          expressionAttributeValues: {
            ':thumbnailKeys': thumbnailKeys,
            ':width': width || 0,
            ':height': height || 0,
          },
        });

        logger.info('DynamoDBメタデータ更新完了', {
          imageId,
          thumbnailKeys,
          width,
          height,
        });
      } catch (error) {
        logger.error('画像リサイズ処理エラー', {
          record,
          error,
        });
        // エラーが発生しても他のレコードの処理は続行
      }
    }

    logger.info('画像リサイズ処理完了', {
      requestId: context.awsRequestId,
    });
  } catch (error) {
    logger.error('画像リサイズ処理全体エラー', { error });
    throw error;
  }
};

/**
 * サムネイル生成
 * 
 * @param imageBuffer - 元画像のバッファ
 * @param width - サムネイル幅
 * @param height - サムネイル高さ
 * @returns サムネイル画像のバッファ
 */
async function generateThumbnail(
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate() // Exif orientationに基づいて自動回転
    .resize(width, height, {
      fit: 'cover', // アスペクト比を維持しながらトリミング
      position: 'center', // 中央を基準にトリミング
    })
    .jpeg({
      quality: 85, // JPEG品質（1-100）
      progressive: true, // プログレッシブJPEG
    })
    .toBuffer();
}
