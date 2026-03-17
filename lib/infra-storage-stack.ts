import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * InfraStorageStackのプロパティ
 */
export interface InfraStorageStackProps extends cdk.StackProps {
  environment: string;
  imagesTableName: string;
  thumbnailsBucketName: string;
}

/**
 * インフラレイヤー: ストレージStack
 * 
 * このStackは以下のリソースを提供します：
 * - S3バケット（画像、サムネイル、管理画面、ビューアー）
 * - CloudFrontディストリビューション（全て）
 * 
 * 依存関係: なし（最初にデプロイ）
 */
export class InfraStorageStack extends cdk.Stack {
  // 他のStackから参照できるようにpublicプロパティとして公開
  public readonly imagesBucket: s3.Bucket;
  public readonly thumbnailsBucket: s3.Bucket;
  public readonly adminFrontendBucket: s3.Bucket;
  public readonly viewerFrontendBucket: s3.Bucket;
  public readonly imagesDistribution: cloudfront.Distribution;
  public readonly thumbnailsDistribution: cloudfront.Distribution;
  public readonly adminDistribution: cloudfront.Distribution;
  public readonly viewerDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: InfraStorageStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ===================================
    // S3バケット: オリジナル画像ストレージ
    // ===================================
    
    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      bucketName: `image-management-images-${environment}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          enabled: true,
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
        {
          id: 'AbortIncompleteMultipartUpload',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          id: 'DeleteTempDownloads',
          enabled: true,
          prefix: 'tmp/',
          expiration: cdk.Duration.days(1),
        },
      ],
      removalPolicy: environment === 'prd' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prd',
    });

    // ===================================
    // S3バケット: サムネイル画像ストレージ
    // ===================================
    
    this.thumbnailsBucket = new s3.Bucket(this, 'ThumbnailsBucket', {
      bucketName: `image-management-thumbnails-${environment}`,
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        {
          id: 'AbortIncompleteMultipartUpload',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: environment === 'prd' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prd',
    });

    // ===================================
    // S3バケット: 管理画面フロントエンド
    // ===================================
    
    this.adminFrontendBucket = new s3.Bucket(this, 'AdminFrontendBucket', {
      bucketName: `image-management-admin-${environment}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: environment === 'prd' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prd',
    });

    // ===================================
    // S3バケット: ビューアーフロントエンド
    // ===================================
    
    this.viewerFrontendBucket = new s3.Bucket(this, 'ViewerFrontendBucket', {
      bucketName: `image-management-viewer-${environment}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: environment === 'prd' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prd',
    });

    // ===================================
    // CloudFront: 画像配信
    // ===================================
    
    const imagesOAI = new cloudfront.OriginAccessIdentity(this, 'ImagesOAI', {
      comment: `OAI for ${this.imagesBucket.bucketName}`,
    });
    this.imagesBucket.grantRead(imagesOAI);

    this.imagesDistribution = new cloudfront.Distribution(this, 'ImagesDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.imagesBucket, {
          originAccessIdentity: imagesOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },
      priceClass: environment === 'prd'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      comment: `Images distribution for image-management (${environment})`,
    });

    // ===================================
    // CloudFront: サムネイル配信
    // ===================================
    
    const thumbnailsOAI = new cloudfront.OriginAccessIdentity(this, 'ThumbnailsOAI', {
      comment: `OAI for ${this.thumbnailsBucket.bucketName}`,
    });
    this.thumbnailsBucket.grantRead(thumbnailsOAI);

    this.thumbnailsDistribution = new cloudfront.Distribution(this, 'ThumbnailsDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.thumbnailsBucket, {
          originAccessIdentity: thumbnailsOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },
      priceClass: environment === 'prd'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      comment: `Thumbnails distribution for image-management (${environment})`,
    });

    // ===================================
    // CloudFront: 管理画面配信
    // ===================================
    
    const adminOAI = new cloudfront.OriginAccessIdentity(this, 'AdminOAI', {
      comment: `OAI for ${this.adminFrontendBucket.bucketName}`,
    });
    this.adminFrontendBucket.grantRead(adminOAI);

    this.adminDistribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.adminFrontendBucket, {
          originAccessIdentity: adminOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: environment === 'prd'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      comment: `Admin frontend distribution for image-management (${environment})`,
    });

    // ===================================
    // CloudFront: ビューアー配信
    // ===================================
    
    const viewerOAI = new cloudfront.OriginAccessIdentity(this, 'ViewerOAI', {
      comment: `OAI for ${this.viewerFrontendBucket.bucketName}`,
    });
    this.viewerFrontendBucket.grantRead(viewerOAI);

    this.viewerDistribution = new cloudfront.Distribution(this, 'ViewerDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.viewerFrontendBucket, {
          originAccessIdentity: viewerOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      priceClass: environment === 'prd'
        ? cloudfront.PriceClass.PRICE_CLASS_ALL
        : cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      comment: `Viewer frontend distribution for image-management (${environment})`,
    });

    // ===================================
    // Outputs
    // ===================================
    
    new cdk.CfnOutput(this, 'ImagesBucketName', {
      value: this.imagesBucket.bucketName,
      description: 'オリジナル画像ストレージのバケット名',
      exportName: `${this.stackName}-ImagesBucketName`,
    });

    new cdk.CfnOutput(this, 'ThumbnailsBucketName', {
      value: this.thumbnailsBucket.bucketName,
      description: 'サムネイル画像ストレージのバケット名',
      exportName: `${this.stackName}-ThumbnailsBucketName`,
    });

    new cdk.CfnOutput(this, 'AdminFrontendBucketName', {
      value: this.adminFrontendBucket.bucketName,
      description: '管理画面フロントエンドのバケット名',
      exportName: `${this.stackName}-AdminFrontendBucketName`,
    });

    new cdk.CfnOutput(this, 'ViewerFrontendBucketName', {
      value: this.viewerFrontendBucket.bucketName,
      description: 'ビューアーフロントエンドのバケット名',
      exportName: `${this.stackName}-ViewerFrontendBucketName`,
    });

    new cdk.CfnOutput(this, 'ImagesCloudFrontUrl', {
      value: `https://${this.imagesDistribution.distributionDomainName}`,
      description: '画像配信用CloudFront URL',
    });

    new cdk.CfnOutput(this, 'ThumbnailsCloudFrontUrl', {
      value: `https://${this.thumbnailsDistribution.distributionDomainName}`,
      description: 'サムネイル配信用CloudFront URL',
    });

    new cdk.CfnOutput(this, 'AdminCloudFrontUrl', {
      value: `https://${this.adminDistribution.distributionDomainName}`,
      description: '管理画面CloudFront URL',
    });

    new cdk.CfnOutput(this, 'ViewerCloudFrontUrl', {
      value: `https://${this.viewerDistribution.distributionDomainName}`,
      description: 'ビューアーCloudFront URL',
    });

    // ===================================
    // Lambda: 画像リサイズ処理
    // ===================================
    
    const imageResizeFunction = new lambda.Function(this, 'ImageResizeFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'handlers/image-resize.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-ImageResize-${environment}`,
      description: '画像リサイズ処理（サムネイル生成）',
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        THUMBNAILS_BUCKET: props.thumbnailsBucketName,
        IMAGES_TABLE: props.imagesTableName,
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
      logRetention: environment === 'prd'
        ? logs.RetentionDays.ONE_MONTH
        : logs.RetentionDays.ONE_WEEK,
    });

    // S3とDynamoDBへのアクセス権限を付与
    this.imagesBucket.grantRead(imageResizeFunction);
    this.thumbnailsBucket.grantWrite(imageResizeFunction);
    
    imageResizeFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:UpdateItem',
      ],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${props.imagesTableName}`],
    }));

    // S3イベント通知の設定
    this.imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(imageResizeFunction),
      {
        prefix: 'images/',
        suffix: '.jpg',
      }
    );

    this.imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(imageResizeFunction),
      {
        prefix: 'images/',
        suffix: '.jpeg',
      }
    );
  }
}
