// exif-parserの型定義がないため、anyとして扱う
const ExifParser = require('exif-parser');
import { logger } from './logger';

/**
 * EXIF情報の型定義
 */
export interface ExifMetadata {
  capturedAt?: string;        // 撮影日時（ISO 8601形式）
  cameraMake?: string;         // カメラメーカー
  cameraModel?: string;        // カメラモデル
  width?: number;              // 画像幅
  height?: number;             // 画像高さ
  orientation?: number;        // 画像の向き
  latitude?: number;           // 緯度
  longitude?: number;          // 経度
  iso?: number;                // ISO感度
  fNumber?: number;            // F値
  exposureTime?: number;       // 露出時間
  focalLength?: number;        // 焦点距離
}

/**
 * EXIF情報を抽出する
 * 
 * @param buffer - 画像ファイルのバッファ
 * @returns EXIF情報
 */
export const extractExifMetadata = (buffer: Buffer): ExifMetadata => {
  try {
    // EXIF情報を解析
    const parser = ExifParser.create(buffer);
    const result = parser.parse();

    logger.debug('EXIF情報解析結果', { result });

    const metadata: ExifMetadata = {};

    // 撮影日時の抽出
    if (result.tags?.DateTimeOriginal) {
      // Unix timestampをISO 8601形式に変換
      const date = new Date(result.tags.DateTimeOriginal * 1000);
      metadata.capturedAt = date.toISOString();
    } else if (result.tags?.DateTime) {
      const date = new Date(result.tags.DateTime * 1000);
      metadata.capturedAt = date.toISOString();
    }

    // カメラ情報の抽出
    if (result.tags?.Make) {
      metadata.cameraMake = result.tags.Make;
    }
    if (result.tags?.Model) {
      metadata.cameraModel = result.tags.Model;
    }

    // 画像サイズの抽出
    if (result.imageSize) {
      metadata.width = result.imageSize.width;
      metadata.height = result.imageSize.height;
    }

    // 画像の向きの抽出
    if (result.tags?.Orientation) {
      metadata.orientation = result.tags.Orientation;
    }

    // GPS情報の抽出
    if (result.tags?.GPSLatitude && result.tags?.GPSLongitude) {
      metadata.latitude = result.tags.GPSLatitude;
      metadata.longitude = result.tags.GPSLongitude;
    }

    // 撮影設定の抽出
    if (result.tags?.ISO) {
      metadata.iso = result.tags.ISO;
    }
    if (result.tags?.FNumber) {
      metadata.fNumber = result.tags.FNumber;
    }
    if (result.tags?.ExposureTime) {
      metadata.exposureTime = result.tags.ExposureTime;
    }
    if (result.tags?.FocalLength) {
      metadata.focalLength = result.tags.FocalLength;
    }

    logger.info('EXIF情報抽出成功', { metadata });

    return metadata;
  } catch (error) {
    // EXIF情報が存在しない、または解析に失敗した場合
    logger.warn('EXIF情報の抽出に失敗', { error });
    return {};
  }
};

/**
 * 画像サイズを取得する（EXIF情報がない場合のフォールバック）
 * 
 * @param buffer - 画像ファイルのバッファ
 * @returns 画像サイズ
 */
export const getImageSize = (buffer: Buffer): { width?: number; height?: number } => {
  try {
    // JPEGファイルのマジックナンバーをチェック
    if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
      logger.warn('JPEGファイルではありません');
      return {};
    }

    // SOF0マーカー（0xFFC0）を探す
    let offset = 2;
    while (offset < buffer.length - 1) {
      if (buffer[offset] === 0xFF) {
        const marker = buffer[offset + 1];
        
        // SOF0, SOF1, SOF2マーカー
        if (marker >= 0xC0 && marker <= 0xC2) {
          // マーカーの後の2バイトはセグメント長
          const segmentLength = buffer.readUInt16BE(offset + 2);
          
          // 画像サイズは5バイト目から
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          
          logger.debug('画像サイズ取得成功', { width, height });
          
          return { width, height };
        }
        
        // 次のマーカーへ移動
        offset += 2 + buffer.readUInt16BE(offset + 2);
      } else {
        offset++;
      }
    }

    logger.warn('画像サイズの取得に失敗');
    return {};
  } catch (error) {
    logger.error('画像サイズの取得中にエラー', { error });
    return {};
  }
};
