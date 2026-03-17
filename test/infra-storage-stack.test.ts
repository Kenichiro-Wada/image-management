import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfraStorageStack } from '../lib/infra-storage-stack';

describe('InfraStorageStack', () => {
  describe('Stack基本設定', () => {
    test('dev環境でStackが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });

    test('prd環境でStackが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'prd',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
        env: {
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });
  });

  describe('S3バケット: オリジナル画像ストレージ', () => {
    test('dev環境でS3バケットが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // S3バケットが4つ作成されているか確認（画像、サムネイル、管理画面、ビューアー）
      template.resourceCountIs('AWS::S3::Bucket', 4);
      
      // オリジナル画像バケット名が正しいか確認
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'image-management-images-dev',
      });
    });

    test('バージョニングが有効化されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // バージョニング設定を確認
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'image-management-images-dev',
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      });
    });

    test('S3マネージド暗号化が設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 暗号化設定を確認
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        },
      });
    });

    test('パブリックアクセスがブロックされている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // パブリックアクセスブロック設定を確認
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('dev環境では削除ポリシーがDESTROYに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除ポリシーを確認
      template.hasResource('AWS::S3::Bucket', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
    });

    test('prd環境では削除ポリシーがRETAINに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'prd',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除ポリシーを確認
      template.hasResource('AWS::S3::Bucket', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });
  });

  describe('CloudFrontディストリビューション', () => {
    test('CloudFrontディストリビューションが4つ作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // CloudFrontディストリビューションが4つ作成されていることを確認
      template.resourceCountIs('AWS::CloudFront::Distribution', 4);
    });

    test('HTTPSリダイレクトが設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // ViewerProtocolPolicyを確認
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: {
            ViewerProtocolPolicy: 'redirect-to-https',
          },
        },
      });
    });

    test('dev環境では価格クラスがPRICE_CLASS_100に設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 価格クラスを確認
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_100',
        },
      });
    });

    test('prd環境では価格クラスがPRICE_CLASS_ALLに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'prd',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 価格クラスを確認
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_All',
        },
      });
    });
  });

  describe('Outputs', () => {
    test('すべてのバケット名がOutputsに出力されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Outputsを確認
      template.hasOutput('ImagesBucketName', {});
      template.hasOutput('ThumbnailsBucketName', {});
      template.hasOutput('AdminFrontendBucketName', {});
      template.hasOutput('ViewerFrontendBucketName', {});
    });

    test('すべてのCloudFront URLがOutputsに出力されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraStorageStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
        thumbnailsBucketName: 'test-thumbnails-bucket',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Outputsを確認
      template.hasOutput('ImagesCloudFrontUrl', {});
      template.hasOutput('ThumbnailsCloudFrontUrl', {});
      template.hasOutput('AdminCloudFrontUrl', {});
      template.hasOutput('ViewerCloudFrontUrl', {});
    });
  });
});
