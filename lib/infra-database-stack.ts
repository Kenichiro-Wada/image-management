import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * InfraDatabaseStackのプロパティ
 */
export interface InfraDatabaseStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * インフラレイヤー: データベースStack
 * 
 * このStackは以下のリソースを提供します：
 * - DynamoDBテーブル（画像メタデータ、タグ、ユーザー）
 * 
 * 依存関係: なし（StorageStackと並行してデプロイ可能）
 */
export class InfraDatabaseStack extends cdk.Stack {
  // 他のStackから参照できるようにpublicプロパティとして公開
  public readonly imagesTable: dynamodb.Table;
  public readonly tagsTable: dynamodb.Table;
  public readonly usersTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: InfraDatabaseStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ===================================
    // DynamoDB: 画像メタデータテーブル
    // ===================================
    
    this.imagesTable = new dynamodb.Table(this, 'ImagesTable', {
      tableName: `ImageManagement-Images-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      deletionProtection: environment === 'prd',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: environment === 'prd'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: ユーザー別画像一覧
    this.imagesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: 公開画像一覧
    this.imagesTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ===================================
    // DynamoDB: タグ管理テーブル
    // ===================================
    
    this.tagsTable = new dynamodb.Table(this, 'TagsTable', {
      tableName: `ImageManagement-Tags-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      deletionProtection: environment === 'prd',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: environment === 'prd'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ===================================
    // DynamoDB: ユーザー情報テーブル
    // ===================================
    
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: `ImageManagement-Users-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      deletionProtection: environment === 'prd',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: environment === 'prd'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ===================================
    // Outputs
    // ===================================
    
    new cdk.CfnOutput(this, 'ImagesTableName', {
      value: this.imagesTable.tableName,
      description: '画像メタデータテーブル名',
      exportName: `${this.stackName}-ImagesTableName`,
    });

    new cdk.CfnOutput(this, 'TagsTableName', {
      value: this.tagsTable.tableName,
      description: 'タグ管理テーブル名',
      exportName: `${this.stackName}-TagsTableName`,
    });

    new cdk.CfnOutput(this, 'UsersTableName', {
      value: this.usersTable.tableName,
      description: 'ユーザー情報テーブル名',
      exportName: `${this.stackName}-UsersTableName`,
    });
  }
}
