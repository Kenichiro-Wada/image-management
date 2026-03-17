import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfraAuthStack } from '../lib/infra-auth-stack';

describe('InfraAuthStack', () => {
  describe('Stack基本設定', () => {
    test('dev環境でStackが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
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
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'prd',
        env: {
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });
  });

  describe('Cognito User Pool', () => {
    test('User Poolが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // User Poolが作成されていることを確認
      template.resourceCountIs('AWS::Cognito::UserPool', 1);
      
      // User Pool名を確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'ImageManagement-UserPool-dev',
      });
    });

    test('メールアドレスでのサインインが設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // サインイン設定を確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UsernameAttributes: ['email'],
      });
    });

    test('メール自動検証が有効化されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 自動検証設定を確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AutoVerifiedAttributes: ['email'],
      });
    });

    test('パスワードポリシーが正しく設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // パスワードポリシーを確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
            TemporaryPasswordValidityDays: 7,
          },
        },
      });
    });

    test('MFAがオプショナルに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // MFA設定を確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        MfaConfiguration: 'OPTIONAL',
      });
    });

    test('セルフサービスサインアップが無効化されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // セルフサインアップ設定を確認
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });

    test('dev環境では削除ポリシーがDESTROYに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除ポリシーを確認
      template.hasResource('AWS::Cognito::UserPool', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
    });

    test('prd環境では削除ポリシーがRETAINに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'prd',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除ポリシーを確認
      template.hasResource('AWS::Cognito::UserPool', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });
  });

  describe('Cognito User Pool Client', () => {
    test('User Pool Clientが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // User Pool Clientが作成されていることを確認
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
      
      // Client名を確認
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ClientName: 'ImageManagement-WebApp-dev',
      });
    });

    test('認証フローが正しく設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 認証フローを確認
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: [
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ],
      });
    });

    test('トークン有効期限が正しく設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // トークン有効期限を確認
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AccessTokenValidity: 60,  // 1時間（分単位）
        IdTokenValidity: 60,      // 1時間（分単位）
        RefreshTokenValidity: 43200, // 30日（分単位: 30 * 24 * 60）
        TokenValidityUnits: {
          AccessToken: 'minutes',
          IdToken: 'minutes',
          RefreshToken: 'minutes',
        },
      });
    });
  });

  describe('ユーザーグループ', () => {
    test('3つのユーザーグループが作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // ユーザーグループが3つ作成されていることを確認
      template.resourceCountIs('AWS::Cognito::UserPoolGroup', 3);
    });

    test('System_Adminグループが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // System_Adminグループを確認
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'System_Admin',
        Description: 'システム管理者 - 全ユーザーの画像の完全な管理権限',
        Precedence: 1,
      });
    });

    test('Image_Managerグループが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Image_Managerグループを確認
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'Image_Manager',
        Description: '画像管理者 - 全ユーザーの画像の閲覧・公開状態制御・ダウンロード権限',
        Precedence: 2,
      });
    });

    test('Regular_Userグループが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Regular_Userグループを確認
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'Regular_User',
        Description: '一般ユーザー - 自分の画像のみの管理権限',
        Precedence: 3,
      });
    });
  });

  describe('Outputs', () => {
    test('すべての必要なOutputsが出力されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraAuthStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Outputsを確認
      template.hasOutput('UserPoolId', {});
      template.hasOutput('UserPoolArn', {});
      template.hasOutput('UserPoolClientId', {});
      template.hasOutput('UserPoolDomain', {});
    });
  });
});
