import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * S3クライアントのシングルトンインスタンス
 * Lambda関数のコールドスタート対策として、関数外で初期化
 */
const client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

/**
 * S3ヘルパー関数
 */
export const s3 = {
  /**
   * オブジェクトをアップロード
   */
  putObject: async (params: {
    Bucket: string;
    Key: string;
    Body: Buffer | Uint8Array | string;
    ContentType?: string;
    Metadata?: Record<string, string>;
  }) => {
    const command = new PutObjectCommand(params);
    await client.send(command);
  },

  /**
   * オブジェクトを取得
   */
  getObject: async (params: { Bucket: string; Key: string }) => {
    const command = new GetObjectCommand(params);
    const result = await client.send(command);
    
    // Streamをバッファに変換
    const stream = result.Body as any;
    const chunks: Uint8Array[] = [];
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return {
      Body: Buffer.concat(chunks),
      ContentType: result.ContentType,
      ContentLength: result.ContentLength,
      Metadata: result.Metadata,
    };
  },

  /**
   * オブジェクトを削除
   */
  deleteObject: async (params: { Bucket: string; Key: string }) => {
    const command = new DeleteObjectCommand(params);
    await client.send(command);
  },

  /**
   * オブジェクトのメタデータを取得
   */
  headObject: async (params: { Bucket: string; Key: string }) => {
    const command = new HeadObjectCommand(params);
    const result = await client.send(command);
    return {
      ContentType: result.ContentType,
      ContentLength: result.ContentLength,
      Metadata: result.Metadata,
      LastModified: result.LastModified,
    };
  },

  /**
   * オブジェクトをコピー
   */
  copyObject: async (params: {
    SourceBucket: string;
    SourceKey: string;
    DestinationBucket: string;
    DestinationKey: string;
  }) => {
    const command = new CopyObjectCommand({
      CopySource: `${params.SourceBucket}/${params.SourceKey}`,
      Bucket: params.DestinationBucket,
      Key: params.DestinationKey,
    });
    await client.send(command);
  },

  /**
   * オブジェクト一覧を取得
   */
  listObjects: async (params: {
    Bucket: string;
    Prefix?: string;
    MaxKeys?: number;
    ContinuationToken?: string;
  }) => {
    const command = new ListObjectsV2Command(params);
    const result = await client.send(command);
    return {
      Contents: result.Contents || [],
      NextContinuationToken: result.NextContinuationToken,
      KeyCount: result.KeyCount || 0,
    };
  },

  /**
   * 署名付きURLを生成（アップロード用）
   */
  getSignedUploadUrl: async (params: {
    Bucket: string;
    Key: string;
    ContentType?: string;
    ExpiresIn?: number;
  }) => {
    const command = new PutObjectCommand({
      Bucket: params.Bucket,
      Key: params.Key,
      ContentType: params.ContentType,
    });
    
    return await getSignedUrl(client, command, {
      expiresIn: params.ExpiresIn || 3600, // デフォルト1時間
    });
  },

  /**
   * 署名付きURLを生成（ダウンロード用）
   */
  getSignedDownloadUrl: async (params: {
    Bucket: string;
    Key: string;
    ExpiresIn?: number;
  }) => {
    const command = new GetObjectCommand({
      Bucket: params.Bucket,
      Key: params.Key,
    });
    
    return await getSignedUrl(client, command, {
      expiresIn: params.ExpiresIn || 3600, // デフォルト1時間
    });
  },
};

export { client as s3Client };

/**
 * 個別関数のエクスポート（後方互換性のため）
 */
export const putObject = async (params: {
  bucket: string;
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  metadata?: Record<string, string>;
}) => {
  return s3.putObject({
    Bucket: params.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
    Metadata: params.metadata,
  });
};

export const getObject = async (params: { bucket: string; key: string }) => {
  return s3.getObject({ Bucket: params.bucket, Key: params.key });
};

export const deleteObject = async (params: { bucket: string; key: string }) => {
  return s3.deleteObject({ Bucket: params.bucket, Key: params.key });
};
