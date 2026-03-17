import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * AppAdminStackのプロパティ
 */
export interface AppAdminStackProps extends cdk.StackProps {
  environment: string;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  imagesBucketName: string;
  thumbnailsBucketName: string;
  imagesTableName: string;
  tagsTableName: string;
  usersTableName: string;
}

/**
 * アプリケーションレイヤー: 管理画面Stack
 * 
 * このStackは以下のリソースを提供します：
 * - API Gateway（管理画面用エンドポイント）
 * - Lambda関数（画像アップロード、削除、タグ管理など）
 * 
 * 依存関係:
 * - InfraStorageStack（S3バケット）
 * - InfraDatabaseStack（DynamoDBテーブル）
 * - InfraAuthStack（Cognito User Pool）
 */
export class AppAdminStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AppAdminStackProps) {
    super(scope, id, props);

    const { environment, userPool, userPoolClient } = props;

    // ===================================
    // CloudWatch Logs
    // ===================================
    
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/apigateway/image-management-admin-${environment}`,
      retention: environment === 'prd' 
        ? logs.RetentionDays.ONE_MONTH 
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: environment === 'prd'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ===================================
    // API Gateway
    // ===================================
    
    this.api = new apigateway.RestApi(this, 'AdminApi', {
      restApiName: `ImageManagement-Admin-API-${environment}`,
      description: `管理画面用REST API (${environment})`,
      
      // バイナリメディアタイプ設定（ZIP等のバイナリレスポンス対応）
      binaryMediaTypes: ['application/zip', 'application/octet-stream'],
      
      // デプロイ設定
      deploy: true,
      deployOptions: {
        stageName: environment,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        metricsEnabled: true,
        tracingEnabled: environment === 'prd',
      },
      
      // CORS設定
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
      },
      
      // エンドポイント設定
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      
      // CloudWatch Role
      cloudWatchRole: true,
    });

    // ===================================
    // Cognito Authorizer
    // ===================================
    
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `ImageManagement-Authorizer-${environment}`,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // ===================================
    // API リソース構造
    // ===================================
    
    // /api
    const apiResource = this.api.root.addResource('api');
    
    // /api/admin
    const adminResource = apiResource.addResource('admin');
    
    // /api/admin/images
    const imagesResource = adminResource.addResource('images');
    
    // /api/admin/images/upload
    const uploadResource = imagesResource.addResource('upload');
    
    // /api/admin/images/upload-url（署名付きURL発行）
    const uploadUrlResource = imagesResource.addResource('upload-url');
    
    // /api/admin/images/confirm-upload（アップロード確認）
    const confirmUploadResource = imagesResource.addResource('confirm-upload');
    
    // /api/admin/images/{id}
    const imageIdResource = imagesResource.addResource('{id}');
    
    // /api/admin/images/{id}/tags
    const tagsResource = imageIdResource.addResource('tags');
    
    // /api/admin/images/{id}/tags/{tagName}
    const tagNameResource = tagsResource.addResource('{tagName}');
    
    // /api/admin/images/{id}/visibility
    const visibilityResource = imageIdResource.addResource('visibility');
    
    // /api/admin/images/{id}/download
    const downloadResource = imageIdResource.addResource('download');
    
    // /api/admin/images/bulk
    const bulkResource = imagesResource.addResource('bulk');
    
    // /api/admin/images/download/bulk
    const downloadBulkResource = imagesResource
      .addResource('download')
      .addResource('bulk');
    
    // /api/admin/images/visibility/bulk
    const visibilityBulkResource = imagesResource
      .addResource('visibility')
      .addResource('bulk');
    
    // /api/admin/images/tags/bulk
    const tagsBulkResource = imagesResource
      .addResource('tags')
      .addResource('bulk');

    // /api/admin/tags
    const adminTagsResource = adminResource.addResource('tags');
    
    // /api/admin/tags/autocomplete
    const autocompleteResource = adminTagsResource.addResource('autocomplete');
    
    // /api/admin/images/{id}/rating
    const ratingResource = imageIdResource.addResource('rating');

    // /api/admin/auth
    const authResource = adminResource.addResource('auth');
    
    // /api/admin/auth/login
    const loginResource = authResource.addResource('login');
    
    // /api/admin/auth/verify
    const verifyResource = authResource.addResource('verify');
    
    // /api/admin/auth/user
    const userResource = authResource.addResource('user');
    
    // /api/admin/auth/verify-recaptcha
    const verifyRecaptchaResource = authResource.addResource('verify-recaptcha');

    // ===================================
    // Lambda関数
    // ===================================
    
    // 画像アップロードLambda関数
    const imageUploadFunction = new lambda.Function(this, 'ImageUploadFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-upload.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageUpload-${environment}`,
      description: '画像アップロード処理',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        IMAGES_BUCKET: props.imagesBucketName,
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // S3バケットへの書き込み権限を付与
    imageUploadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
        's3:PutObjectAcl',
      ],
      resources: [`arn:aws:s3:::${props.imagesBucketName}/*`],
    }));

    // DynamoDBテーブルへの書き込み権限を付与
    imageUploadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
      ],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`],
    }));

    // 署名付きURL発行Lambda関数
    const imageUploadUrlFunction = new lambda.Function(this, 'ImageUploadUrlFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-upload-url.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageUploadUrl-${environment}`,
      description: '画像アップロード用署名付きURL発行',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        IMAGES_BUCKET: props.imagesBucketName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // S3バケットへのPutObject権限を付与（署名付きURL発行に必要）
    imageUploadUrlFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObject',
      ],
      resources: [`arn:aws:s3:::${props.imagesBucketName}/*`],
    }));

    // アップロード確認Lambda関数
    const imageConfirmUploadFunction = new lambda.Function(this, 'ImageConfirmUploadFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-confirm-upload.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageConfirmUpload-${environment}`,
      description: '画像アップロード確認・メタデータ登録',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        IMAGES_BUCKET: props.imagesBucketName,
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // S3バケットへのHeadObject権限を付与
    imageConfirmUploadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:HeadObject',
      ],
      resources: [`arn:aws:s3:::${props.imagesBucketName}/*`],
    }));

    // DynamoDBテーブルへの書き込み権限を付与
    imageConfirmUploadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
      ],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`],
    }));

    // 画像一覧取得Lambda関数
    const imageListFunction = new lambda.Function(this, 'ImageListFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-list.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageList-${environment}`,
      description: '画像一覧取得処理（管理画面用）',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // タグ追加Lambda関数
    const imageTagAddFunction = new lambda.Function(this, 'ImageTagAddFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-tag-add.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageTagAdd-${environment}`,
      description: 'タグ追加処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        TAGS_TABLE: props.tagsTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // タグ削除Lambda関数
    const imageTagDeleteFunction = new lambda.Function(this, 'ImageTagDeleteFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-tag-delete.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageTagDelete-${environment}`,
      description: 'タグ削除処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        TAGS_TABLE: props.tagsTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // タグオートコンプリートLambda関数
    const tagAutocompleteFunction = new lambda.Function(this, 'TagAutocompleteFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/tag-autocomplete.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-TagAutocomplete-${environment}`,
      description: 'タグオートコンプリート処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        TAGS_TABLE: props.tagsTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 画像削除Lambda関数
    const imageDeleteFunction = new lambda.Function(this, 'ImageDeleteFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-delete.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageDelete-${environment}`,
      description: '画像削除処理',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        IMAGES_BUCKET: props.imagesBucketName,
        THUMBNAILS_BUCKET: props.thumbnailsBucketName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 一括画像削除Lambda関数
    const imageBulkDeleteFunction = new lambda.Function(this, 'ImageBulkDeleteFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-bulk-delete.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageBulkDelete-${environment}`,
      description: '一括画像削除処理',
      timeout: cdk.Duration.seconds(60), // 一括処理のため長めに設定
      memorySize: 512,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        IMAGES_BUCKET: props.imagesBucketName,
        THUMBNAILS_BUCKET: props.thumbnailsBucketName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 画像ダウンロードLambda関数
    const imageDownloadFunction = new lambda.Function(this, 'ImageDownloadFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-download.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageDownload-${environment}`,
      description: '画像ダウンロード処理',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        IMAGES_BUCKET: props.imagesBucketName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 一括画像ダウンロードLambda関数
    const imageBulkDownloadFunction = new lambda.Function(this, 'ImageBulkDownloadFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-bulk-download.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageBulkDownload-${environment}`,
      description: '一括画像ダウンロード処理（ストリーミングZIP圧縮、最大200枚）',
      timeout: cdk.Duration.seconds(300), // 大量画像のZIP生成のため長めに設定
      memorySize: 2048, // ストリーミング処理のため多めに設定
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        IMAGES_BUCKET: props.imagesBucketName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 公開状態変更Lambda関数
    const imageVisibilityFunction = new lambda.Function(this, 'ImageVisibilityFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-visibility.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageVisibility-${environment}`,
      description: '画像公開状態変更処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 一括公開状態変更Lambda関数
    const imageBulkVisibilityFunction = new lambda.Function(this, 'ImageBulkVisibilityFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-bulk-visibility.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageBulkVisibility-${environment}`,
      description: '一括公開状態変更処理',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // 一括タグ追加Lambda関数
    const imageBulkTagFunction = new lambda.Function(this, 'ImageBulkTagFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-bulk-tag.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageBulkTag-${environment}`,
      description: '一括タグ追加処理',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        TAGS_TABLE: props.tagsTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // ログインLambda関数
    const authLoginFunction = new lambda.Function(this, 'AuthLoginFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/auth-login.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-AuthLogin-${environment}`,
      description: 'ログイン処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        USER_POOL_CLIENT_ID: userPool.userPoolProviderName, // TODO: 正しいクライアントIDを設定
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // トークン検証Lambda関数
    const authVerifyFunction = new lambda.Function(this, 'AuthVerifyFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/auth-verify.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-AuthVerify-${environment}`,
      description: 'トークン検証処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // ユーザー情報取得Lambda関数
    const authUserFunction = new lambda.Function(this, 'AuthUserFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/auth-user.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-AuthUser-${environment}`,
      description: 'ユーザー情報取得処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        USERS_TABLE: props.usersTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // reCAPTCHA検証Lambda関数
    const verifyRecaptchaFunction = new lambda.Function(this, 'VerifyRecaptchaFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/verify-recaptcha.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-VerifyRecaptcha-${environment}`,
      description: 'reCAPTCHA検証処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY || '',
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // レーティングLambda関数
    const imageRatingFunction = new lambda.Function(this, 'ImageRatingFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-rating.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageRating-${environment}`,
      description: 'レーティング追加・更新・取得処理',
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // ===================================
    // Lambda関数の権限設定
    // ===================================

    // DynamoDBテーブルへの読み取り権限を付与（画像一覧取得）
    imageListFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Query',
        'dynamodb:Scan',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}/index/*`,
      ],
    }));

    // DynamoDBテーブルへの読み書き権限を付与（タグ追加）
    imageTagAddFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:PutItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.tagsTableName}`,
      ],
    }));

    // DynamoDBテーブルへの読み書き権限を付与（タグ削除）
    imageTagDeleteFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.tagsTableName}`,
      ],
    }));

    // DynamoDBテーブルへの読み取り権限を付与（タグオートコンプリート）
    tagAutocompleteFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.tagsTableName}`,
      ],
    }));

    // S3とDynamoDBへの削除権限を付与（画像削除）
    imageDeleteFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:DeleteItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    imageDeleteFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:DeleteObject',
      ],
      resources: [
        `arn:aws:s3:::${props.imagesBucketName}/*`,
        `arn:aws:s3:::${props.thumbnailsBucketName}/*`,
      ],
    }));

    // S3とDynamoDBへの削除権限を付与（一括画像削除）
    imageBulkDeleteFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:DeleteItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    imageBulkDeleteFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:DeleteObject',
      ],
      resources: [
        `arn:aws:s3:::${props.imagesBucketName}/*`,
        `arn:aws:s3:::${props.thumbnailsBucketName}/*`,
      ],
    }));

    // S3とDynamoDBへの読み取り権限を付与（画像ダウンロード）
    imageDownloadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    imageDownloadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
      ],
      resources: [
        `arn:aws:s3:::${props.imagesBucketName}/*`,
      ],
    }));

    // S3とDynamoDBへの読み取り権限を付与（一括画像ダウンロード）
    imageBulkDownloadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    imageBulkDownloadFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
      ],
      resources: [
        `arn:aws:s3:::${props.imagesBucketName}/*`,
      ],
    }));

    // DynamoDBへの読み書き権限を付与（公開状態変更）
    imageVisibilityFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    // DynamoDBへの読み書き権限を付与（一括公開状態変更）
    imageBulkVisibilityFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    // DynamoDBテーブルへの読み書き権限を付与（一括タグ追加）
    imageBulkTagFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
        'dynamodb:PutItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.tagsTableName}`,
      ],
    }));

    // Cognitoへのアクセス権限を付与（ログイン）
    authLoginFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:InitiateAuth',
      ],
      resources: [userPool.userPoolArn],
    }));

    // DynamoDBへの読み書き権限を付与（ユーザー情報取得）
    authUserFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.usersTableName}`,
      ],
    }));

    // DynamoDBへの読み書き権限を付与（レーティング）
    imageRatingFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    // ===================================
    // API Gateway統合
    // ===================================
    
    // 画像アップロードエンドポイント
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(imageUploadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '500' },
      ],
    });

    // 署名付きURL発行エンドポイント
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(imageUploadUrlFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '500' },
      ],
    });

    // アップロード確認エンドポイント
    confirmUploadResource.addMethod('POST', new apigateway.LambdaIntegration(imageConfirmUploadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // 画像一覧取得エンドポイント
    imagesResource.addMethod('GET', new apigateway.LambdaIntegration(imageListFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '500' },
      ],
    });

    // タグ追加エンドポイント
    tagsResource.addMethod('POST', new apigateway.LambdaIntegration(imageTagAddFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // タグ削除エンドポイント
    tagNameResource.addMethod('DELETE', new apigateway.LambdaIntegration(imageTagDeleteFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // タグオートコンプリートエンドポイント
    autocompleteResource.addMethod('GET', new apigateway.LambdaIntegration(tagAutocompleteFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401' },
        { statusCode: '500' },
      ],
    });

    // 画像削除エンドポイント
    imageIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(imageDeleteFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // 一括画像削除エンドポイント
    bulkResource.addMethod('DELETE', new apigateway.LambdaIntegration(imageBulkDeleteFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '500' },
      ],
    });

    // 画像ダウンロードエンドポイント
    downloadResource.addMethod('GET', new apigateway.LambdaIntegration(imageDownloadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // 一括画像ダウンロードエンドポイント
    downloadBulkResource.addMethod('POST', new apigateway.LambdaIntegration(imageBulkDownloadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '500' },
      ],
    });

    // 一括公開状態変更エンドポイント
    visibilityBulkResource.addMethod('PATCH', new apigateway.LambdaIntegration(imageBulkVisibilityFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '500' },
      ],
    });

    // 一括タグ追加エンドポイント
    tagsBulkResource.addMethod('POST', new apigateway.LambdaIntegration(imageBulkTagFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '500' },
      ],
    });

    // レーティングエンドポイント（POST: 追加・更新、GET: 取得）
    ratingResource.addMethod('POST', new apigateway.LambdaIntegration(imageRatingFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    ratingResource.addMethod('GET', new apigateway.LambdaIntegration(imageRatingFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // 公開状態変更エンドポイント
    visibilityResource.addMethod('PATCH', new apigateway.LambdaIntegration(imageVisibilityFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // ログインエンドポイント（認証不要）
    loginResource.addMethod('POST', new apigateway.LambdaIntegration(authLoginFunction), {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '401' },
        { statusCode: '403' },
        { statusCode: '404' },
        { statusCode: '429' },
        { statusCode: '500' },
      ],
    });

    // トークン検証エンドポイント（認証必要）
    verifyResource.addMethod('GET', new apigateway.LambdaIntegration(authVerifyFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401' },
        { statusCode: '500' },
      ],
    });

    // ユーザー情報取得エンドポイント（認証必要）
    userResource.addMethod('GET', new apigateway.LambdaIntegration(authUserFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '401' },
        { statusCode: '500' },
      ],
    });

    // reCAPTCHA検証エンドポイント（認証不要）
    verifyRecaptchaResource.addMethod('POST', new apigateway.LambdaIntegration(verifyRecaptchaFunction), {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' },
      ],
    });

    // ===================================
    // ダミーメソッド（API Gateway検証用）
    // ===================================
    
    // API Gatewayの基盤を検証するためのダミーメソッド
    // 実際のLambda統合は後続のタスクで実装
    apiResource.addMethod('GET', 
      new apigateway.MockIntegration({
        integrationResponses: [{
          statusCode: '200',
          responseTemplates: {
            'application/json': '{"message": "OK"}',
          },
        }],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
      }),
      {
        methodResponses: [{ statusCode: '200' }],
      }
    );
    
    // 未使用の変数を使用してwarningを回避
    void uploadResource;
    void tagNameResource;
    void visibilityResource;
    void visibilityBulkResource;
    void downloadResource;
    void bulkResource;
    void downloadBulkResource;
    void autocompleteResource;
    void loginResource;
    void verifyResource;
    void userResource;
    void userPoolClient;

    // ===================================
    // Lambda関数（後続のタスクで実装）
    // ===================================
    
    // TODO: タスク3.2 - 画像アップロード機能
    // TODO: タスク3.3 - 画像リサイズ処理
    // TODO: タスク3.4 - 画像一覧取得機能
    // TODO: タスク3.5 - タグ管理機能
    // TODO: タスク3.6 - 画像削除機能
    // TODO: タスク3.7 - 画像ダウンロード機能
    // TODO: タスク3.8 - 公開状態管理機能
    // TODO: タスク3.9 - 認証API（Cognito Authorizerを含む）

    // ===================================
    // Gateway Responses（エラーレスポンス用CORS設定）
    // ===================================
    
    // 認証エラー（401）
    this.api.addGatewayResponse('Unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,POST,PUT,DELETE,PATCH'",
      },
    });

    // アクセス拒否（403）
    this.api.addGatewayResponse('AccessDenied', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,POST,PUT,DELETE,PATCH'",
      },
    });

    // デフォルト4xxエラー
    this.api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,POST,PUT,DELETE,PATCH'",
      },
    });

    // デフォルト5xxエラー
    this.api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,Authorization'",
        'Access-Control-Allow-Methods': "'OPTIONS,GET,POST,PUT,DELETE,PATCH'",
      },
    });

    // ===================================
    // Outputs
    // ===================================
    
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: '管理画面API URL',
      exportName: `${this.stackName}-ApiUrl`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: '管理画面API ID',
      exportName: `${this.stackName}-ApiId`,
    });

    new cdk.CfnOutput(this, 'ApiStage', {
      value: environment,
      description: 'API Gateway Stage',
    });
  }
}
