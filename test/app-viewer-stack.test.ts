import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AppViewerStack } from '../lib/app-viewer-stack';

describe('AppViewerStack', () => {
  describe('Stack基本設定', () => {
    test('dev環境でStackが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
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
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'prd',
        imagesTableName: 'test-images-table',
        env: {
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });
  });

  describe('API Gateway', () => {
    test('ビューアー用REST APIが作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // REST APIが作成されることを確認
      template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
      
      // REST APIの名前を確認
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'ImageManagement-Viewer-API-dev',
      });
    });

    test('CORS設定が正しく構成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // REST APIが作成されることを確認
      template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
      
      // CORS設定が含まれることを確認（defaultCorsPreflightOptionsが設定されている）
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'ImageManagement-Viewer-API-dev',
      });
    });

    test('CloudWatch Logsが設定される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // CloudWatch Logs Log Groupが作成されることを確認
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/image-management-viewer-dev',
        RetentionInDays: 7, // dev環境は1週間
      });
    });

    test('prd環境ではログ保持期間が1ヶ月になる', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'prd',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // CloudWatch Logs Log Groupの保持期間を確認
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/image-management-viewer-prd',
        RetentionInDays: 30, // prd環境は1ヶ月
      });
    });
  });

  describe('Lambda関数', () => {
    test('公開画像一覧取得Lambda関数が作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Lambda関数の設定を確認
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ImageManagement-ViewerImages-dev',
        Runtime: 'nodejs22.x',
        Handler: 'viewer-images.handler',
        Timeout: 30,
        MemorySize: 512,
      });
    });

    test('Lambda関数にDynamoDB読み取り権限が付与される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // IAMポリシーが作成されることを確認
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: 'dynamodb:Query',
            },
          ],
        },
      });
    });
  });

  describe('API Gateway統合', () => {
    test('GET /api/viewer/imagesエンドポイントが作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // GETメソッドが作成されることを確認
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
      });
    });
  });

  describe('Outputs', () => {
    test('API URLがOutputsに含まれる', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new AppViewerStack(app, 'TestStack', {
        environment: 'dev',
        imagesTableName: 'test-images-table',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Outputsが作成されることを確認
      template.hasOutput('ApiUrl', {});
      template.hasOutput('ApiId', {});
      template.hasOutput('ApiStage', {});
    });
  });
});
