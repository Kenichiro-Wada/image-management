import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * AppViewerStackのプロパティ
 */
export interface AppViewerStackProps extends cdk.StackProps {
  environment: string;
  imagesTableName: string;
}

/**
 * アプリケーションレイヤー: ビューアーStack
 * 
 * このStackは以下のリソースを提供します：
 * - API Gateway（ビューアー用エンドポイント）
 * - Lambda関数（画像一覧取得、検索など）
 * 
 * 依存関係:
 * - InfraStorageStack（S3バケット、CloudFront）
 * - InfraDatabaseStack（DynamoDBテーブル）
 */
export class AppViewerStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AppViewerStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ===================================
    // CloudWatch Logs
    // ===================================
    
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/apigateway/image-management-viewer-${environment}`,
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
    
    this.api = new apigateway.RestApi(this, 'ViewerApi', {
      restApiName: `ImageManagement-Viewer-API-${environment}`,
      description: `ビューアー用REST API (${environment})`,
      
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
    // API リソース構造
    // ===================================
    
    // /api
    const apiResource = this.api.root.addResource('api');
    
    // /api/viewer
    const viewerResource = apiResource.addResource('viewer');
    
    // /api/viewer/images
    const imagesResource = viewerResource.addResource('images');
    
    // /api/viewer/images/search
    const searchResource = imagesResource.addResource('search');

    // /api/public
    const publicResource = apiResource.addResource('public');
    
    // /api/public/images
    const publicImagesResource = publicResource.addResource('images');
    
    // /api/public/images/{id}
    const publicImageResource = publicImagesResource.addResource('{id}');
    
    // /api/public/images/{id}/like
    const likeResource = publicImageResource.addResource('like');

    // ===================================
    // Lambda関数
    // ===================================
    
    // 公開画像一覧取得Lambda関数
    const viewerImagesFunction = new lambda.Function(this, 'ViewerImagesFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/viewer-images.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ViewerImages-${environment}`,
      description: '公開画像一覧取得処理（ビューアー用）',
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

    // 画像検索・フィルタリングLambda関数
    const imageSearchFunction = new lambda.Function(this, 'ImageSearchFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-search.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageSearch-${environment}`,
      description: '画像検索・フィルタリング処理（ビューアー用）',
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

    // DynamoDBテーブルへの読み取り権限を付与（公開画像一覧取得）
    viewerImagesFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Query',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}/index/*`,
      ],
    }));

    // DynamoDBテーブルへの読み取り権限を付与（画像検索）
    imageSearchFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Query',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}/index/*`,
      ],
    }));

    // Like機能Lambda関数
    const imageLikeFunction = new lambda.Function(this, 'ImageLikeFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-like.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageLike-${environment}`,
      description: 'Like追加・解除処理（ビューアー用）',
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

    // DynamoDBテーブルへの読み書き権限を付与（Like機能）
    imageLikeFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem',
        'dynamodb:UpdateItem',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`,
      ],
    }));

    // ===================================
    // API Gateway統合
    // ===================================
    
    // 公開画像一覧取得エンドポイント
    imagesResource.addMethod('GET', new apigateway.LambdaIntegration(viewerImagesFunction), {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' },
      ],
    });

    // 画像検索・フィルタリングエンドポイント
    searchResource.addMethod('GET', new apigateway.LambdaIntegration(imageSearchFunction), {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '500' },
      ],
    });

    // Like追加エンドポイント（認証不要）
    likeResource.addMethod('POST', new apigateway.LambdaIntegration(imageLikeFunction), {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // Like解除エンドポイント（認証不要）
    likeResource.addMethod('DELETE', new apigateway.LambdaIntegration(imageLikeFunction), {
      methodResponses: [
        { statusCode: '200' },
        { statusCode: '400' },
        { statusCode: '404' },
        { statusCode: '500' },
      ],
    });

    // ===================================
    // Outputs
    // ===================================
    
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'ビューアーAPI URL',
      exportName: `${this.stackName}-ApiUrl`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'ビューアーAPI ID',
      exportName: `${this.stackName}-ApiId`,
    });

    new cdk.CfnOutput(this, 'ApiStage', {
      value: environment,
      description: 'API Gateway Stage',
    });
  }
}
