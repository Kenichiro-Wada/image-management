import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Template } from 'aws-cdk-lib/assertions';
import { AppAdminStack } from '../lib/app-admin-stack';

describe('AppAdminStack', () => {
  let app: cdk.App;
  let userPool: cognito.UserPool;
  let userPoolClient: cognito.UserPoolClient;

  beforeEach(() => {
    app = new cdk.App();
    
    // テスト用のUser Poolを作成
    const authStack = new cdk.Stack(app, 'TestAuthStack');
    userPool = new cognito.UserPool(authStack, 'TestUserPool', {
      userPoolName: 'test-pool',
    });
    
    // テスト用のUser Pool Clientを作成
    userPoolClient = userPool.addClient('TestClient', {
      userPoolClientName: 'test-client',
    });
  });

  // テスト用のヘルパー関数
  const createTestStack = (environment: string, additionalProps?: Partial<cdk.StackProps>) => {
    return new AppAdminStack(app, 'TestStack', {
      environment,
      userPool,
      userPoolClient,
      imagesBucketName: 'test-images-bucket',
      thumbnailsBucketName: 'test-thumbnails-bucket',
      imagesTableName: 'test-images-table',
      tagsTableName: 'test-tags-table',
      usersTableName: 'test-users-table',
      ...additionalProps,
    });
  };

  describe('Stack基本設定', () => {
    test('dev環境でStackが正しく作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev', {
        env: {
          account: '123456789012',
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });

    test('prd環境でStackが正しく作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('prd', {
        env: {
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });
  });

  describe('API Gateway', () => {
    test('REST APIが正しく作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // REST APIが作成されていることを確認
      template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
      
      // API名を確認
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'ImageManagement-Admin-API-dev',
      });
    });

    test('CORS設定が正しく設定されている', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // OPTIONSメソッドが作成されていることを確認（CORS用）
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'OPTIONS',
      });
    });

    test('CloudWatch Logsが設定されている', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Log Groupが作成されていることを確認
      template.resourceCountIs('AWS::Logs::LogGroup', 1);
      
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/image-management-admin-dev',
      });
    });

    test('dev環境ではログ保持期間が1週間', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 7,
      });
    });

    test('prd環境ではログ保持期間が1ヶ月', () => {
      // GIVEN & WHEN
      const stack = createTestStack('prd');
      
      // THEN
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 30,
      });
    });

    test('デプロイメントが作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Deploymentが作成されていることを確認
      template.resourceCountIs('AWS::ApiGateway::Deployment', 1);
    });

    test('ステージが作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Stageが作成されていることを確認
      template.resourceCountIs('AWS::ApiGateway::Stage', 1);
      
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        StageName: 'dev',
      });
    });
  });

  describe('Cognito Authorizer', () => {
    test('Cognito Authorizerは後続のタスクで実装予定', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      // 現在はAuthorizerは実装されていない
      // タスク3.9で実装予定
      expect(stack).toBeDefined();
    });
  });

  describe('APIリソース構造', () => {
    test('必要なAPIリソースが作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 複数のリソースが作成されていることを確認
      // /api, /api/admin, /api/admin/images, etc.
      const resources = template.findResources('AWS::ApiGateway::Resource');
      const resourceCount = Object.keys(resources).length;
      
      // 最低限のリソース数を確認（詳細な数は実装により変動）
      expect(resourceCount).toBeGreaterThan(10);
    });
  });

  describe('Outputs', () => {
    test('すべての必要なOutputsが出力されている', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Outputsを確認
      template.hasOutput('ApiUrl', {});
      template.hasOutput('ApiId', {});
      template.hasOutput('ApiStage', {});
    });
  });

  describe('Lambda関数', () => {
    test('画像アップロードLambda関数が作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ImageManagement-ImageUpload-dev',
        Runtime: 'nodejs22.x',
        Handler: 'image-upload.handler',
      });
    });

    test('画像リサイズLambda関数が作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ImageManagement-ImageResize-dev',
        Runtime: 'nodejs22.x',
        Handler: 'image-resize.handler',
        Timeout: 60,
        MemorySize: 1024,
      });
    });

    test('画像一覧取得Lambda関数が作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'ImageManagement-ImageList-dev',
        Runtime: 'nodejs22.x',
        Handler: 'image-list.handler',
        Timeout: 30,
        MemorySize: 512,
      });
    });

    test('画像一覧取得Lambda関数にDynamoDB読み取り権限が付与される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // IAM Policyが作成されていることを確認
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Effect: 'Allow',
              Action: [
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
            },
          ],
        },
      });
    });
  });

  describe('API統合', () => {
    test('画像アップロードエンドポイントが作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // POST /api/admin/images/uploadメソッドが作成されていることを確認
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
      });
    });

    test('画像一覧取得エンドポイントが作成される', () => {
      // GIVEN & WHEN
      const stack = createTestStack('dev');
      
      // THEN
      const template = Template.fromStack(stack);
      
      // GET /api/admin/imagesメソッドが作成されていることを確認
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
      });
    });
  });
});
