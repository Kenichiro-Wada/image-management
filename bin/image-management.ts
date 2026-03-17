#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfraStorageStack } from '../lib/infra-storage-stack';
import { InfraDatabaseStack } from '../lib/infra-database-stack';
import { InfraAuthStack } from '../lib/infra-auth-stack';
import { AppAdminStack } from '../lib/app-admin-stack';
import { AppViewerStack } from '../lib/app-viewer-stack';

const app = new cdk.App();

// 環境設定の取得（デフォルトはdev）
const environment = app.node.tryGetContext('environment') || 'dev';

// リージョン設定の取得（デフォルトはap-northeast-1）
const region = app.node.tryGetContext('region') || 'ap-northeast-1';

// AWSアカウント情報の取得
const account = process.env.CDK_DEFAULT_ACCOUNT;

// 環境名の表示用（Dev、Prd）
const envDisplay = environment.charAt(0).toUpperCase() + environment.slice(1);

// 共通のStack設定
const stackProps = {
  env: {
    account: account,
    region: region,
  },
  tags: {
    Project: 'ImageManagement',
    Environment: environment,
    ManagedBy: 'CDK',
  },
};

// ===================================
// インフラレイヤー（基盤）
// ===================================

// 1. データベースStack（DynamoDB）
const databaseStack = new InfraDatabaseStack(
  app,
  `ImageManagement-Infra-Database-${envDisplay}`,
  {
    ...stackProps,
    environment,
    description: `Image Management - Infrastructure Database Stack (${environment})`,
  }
);

// 2. ストレージStack（S3、CloudFront、画像リサイズLambda）
const storageStack = new InfraStorageStack(
  app,
  `ImageManagement-Infra-Storage-${envDisplay}`,
  {
    ...stackProps,
    environment,
    imagesTableName: databaseStack.imagesTable.tableName,
    thumbnailsBucketName: `image-management-thumbnails-${environment}`,
    description: `Image Management - Infrastructure Storage Stack (${environment})`,
  }
);

// StorageStackはDatabaseStackに依存
storageStack.addDependency(databaseStack);

// 3. 認証Stack（Cognito）
const authStack = new InfraAuthStack(
  app,
  `ImageManagement-Infra-Auth-${envDisplay}`,
  {
    ...stackProps,
    environment,
    description: `Image Management - Infrastructure Auth Stack (${environment})`,
  }
);

// ===================================
// アプリケーションレイヤー
// ===================================

// 4. 管理画面Stack（API Gateway、Lambda）
const adminStack = new AppAdminStack(
  app,
  `ImageManagement-App-Admin-${envDisplay}`,
  {
    ...stackProps,
    environment,
    userPool: authStack.userPool,
    userPoolClient: authStack.userPoolClient,
    imagesBucketName: storageStack.imagesBucket.bucketName,
    thumbnailsBucketName: storageStack.thumbnailsBucket.bucketName,
    imagesTableName: databaseStack.imagesTable.tableName,
    tagsTableName: databaseStack.tagsTable.tableName,
    usersTableName: databaseStack.usersTable.tableName,
    description: `Image Management - Application Admin Stack (${environment})`,
  }
);

// 5. ビューアーStack（API Gateway、Lambda）
const viewerStack = new AppViewerStack(
  app,
  `ImageManagement-App-Viewer-${envDisplay}`,
  {
    ...stackProps,
    environment,
    imagesTableName: databaseStack.imagesTable.tableName,
    description: `Image Management - Application Viewer Stack (${environment})`,
  }
);

// ===================================
// Stack間の依存関係
// ===================================

// アプリケーションレイヤーはインフラレイヤーに依存
adminStack.addDependency(storageStack);
adminStack.addDependency(databaseStack);
adminStack.addDependency(authStack);

viewerStack.addDependency(storageStack);
viewerStack.addDependency(databaseStack);
