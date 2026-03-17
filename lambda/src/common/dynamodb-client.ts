import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDBクライアントのシングルトンインスタンス
 * Lambda関数のコールドスタート対策として、関数外で初期化
 */
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

/**
 * DynamoDB Document Client
 * JavaScript型とDynamoDB型の自動変換を提供
 */
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

/**
 * DynamoDBヘルパー関数
 */
export const dynamoDb = {
  /**
   * アイテムを取得
   */
  get: async (params: { TableName: string; Key: Record<string, any> }) => {
    const command = new GetCommand(params);
    const result = await docClient.send(command);
    return result.Item;
  },

  /**
   * アイテムを保存
   */
  put: async (params: { TableName: string; Item: Record<string, any> }) => {
    const command = new PutCommand(params);
    await docClient.send(command);
  },

  /**
   * アイテムを更新
   */
  update: async (params: {
    TableName: string;
    Key: Record<string, any>;
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, any>;
  }) => {
    const command = new UpdateCommand(params);
    const result = await docClient.send(command);
    return result.Attributes;
  },

  /**
   * アイテムを削除
   */
  delete: async (params: { TableName: string; Key: Record<string, any> }) => {
    const command = new DeleteCommand(params);
    await docClient.send(command);
  },

  /**
   * クエリ実行
   */
  query: async (params: {
    TableName: string;
    IndexName?: string;
    KeyConditionExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, any>;
    Limit?: number;
    ExclusiveStartKey?: Record<string, any>;
    ScanIndexForward?: boolean;
  }) => {
    const command = new QueryCommand(params);
    const result = await docClient.send(command);
    return {
      Items: result.Items || [],
      LastEvaluatedKey: result.LastEvaluatedKey,
      Count: result.Count || 0,
    };
  },

  /**
   * スキャン実行
   */
  scan: async (params: {
    TableName: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, any>;
    Limit?: number;
    ExclusiveStartKey?: Record<string, any>;
  }) => {
    const command = new ScanCommand(params);
    const result = await docClient.send(command);
    return {
      Items: result.Items || [],
      LastEvaluatedKey: result.LastEvaluatedKey,
      Count: result.Count || 0,
    };
  },

  /**
   * バッチ取得
   */
  batchGet: async (params: {
    RequestItems: Record<string, { Keys: Record<string, any>[] }>;
  }) => {
    const command = new BatchGetCommand(params);
    const result = await docClient.send(command);
    return result.Responses || {};
  },

  /**
   * バッチ書き込み
   */
  batchWrite: async (params: {
    RequestItems: Record<
      string,
      Array<
        | { PutRequest: { Item: Record<string, any> } }
        | { DeleteRequest: { Key: Record<string, any> } }
      >
    >;
  }) => {
    const command = new BatchWriteCommand(params);
    await docClient.send(command);
  },
};

/**
 * 個別関数のエクスポート（後方互換性のため）
 */
export const get = async (params: { tableName: string; key: Record<string, any> }) => {
  return dynamoDb.get({ TableName: params.tableName, Key: params.key });
};

export const put = async (params: { tableName: string; item: Record<string, any> }) => {
  return dynamoDb.put({ TableName: params.tableName, Item: params.item });
};

export const update = async (params: {
  tableName: string;
  key: Record<string, any>;
  updateExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
}) => {
  return dynamoDb.update({
    TableName: params.tableName,
    Key: params.key,
    UpdateExpression: params.updateExpression,
    ExpressionAttributeNames: params.expressionAttributeNames,
    ExpressionAttributeValues: params.expressionAttributeValues,
  });
};

export const deleteItem = async (params: { tableName: string; key: Record<string, any> }) => {
  return dynamoDb.delete({ TableName: params.tableName, Key: params.key });
};

export const query = async (params: {
  tableName: string;
  indexName?: string;
  keyConditionExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
  scanIndexForward?: boolean;
}) => {
  return dynamoDb.query({
    TableName: params.tableName,
    IndexName: params.indexName,
    KeyConditionExpression: params.keyConditionExpression,
    ExpressionAttributeNames: params.expressionAttributeNames,
    ExpressionAttributeValues: params.expressionAttributeValues,
    Limit: params.limit,
    ExclusiveStartKey: params.exclusiveStartKey,
    ScanIndexForward: params.scanIndexForward,
  });
};

export const scan = async (params: {
  tableName: string;
  filterExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
}) => {
  return dynamoDb.scan({
    TableName: params.tableName,
    FilterExpression: params.filterExpression,
    ExpressionAttributeNames: params.expressionAttributeNames,
    ExpressionAttributeValues: params.expressionAttributeValues,
    Limit: params.limit,
    ExclusiveStartKey: params.exclusiveStartKey,
  });
};
