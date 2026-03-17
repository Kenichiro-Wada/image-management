import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * InfraAuthStackのプロパティ
 */
export interface InfraAuthStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * インフラレイヤー: 認証Stack
 * 
 * このStackは以下のリソースを提供します：
 * - Cognito User Pool
 * - ユーザーグループ（System_Admin、Image_Manager、Regular_User）
 * 
 * 依存関係: なし（他のインフラStackと並行してデプロイ可能）
 */
export class InfraAuthStack extends cdk.Stack {
  // 他のStackから参照できるようにpublicプロパティとして公開
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly systemAdminGroup: cognito.CfnUserPoolGroup;
  public readonly imageManagerGroup: cognito.CfnUserPoolGroup;
  public readonly regularUserGroup: cognito.CfnUserPoolGroup;

  constructor(scope: Construct, id: string, props: InfraAuthStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ===================================
    // Cognito User Pool
    // ===================================
    
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `ImageManagement-UserPool-${environment}`,
      
      // サインイン設定
      signInAliases: {
        email: true,
        username: false,
      },
      
      // 自動検証設定
      autoVerify: {
        email: true,
      },
      
      // 標準属性
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      
      // パスワードポリシー
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      
      // アカウント復旧設定
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // MFA設定（オプション）
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      
      // セルフサービスサインアップ
      selfSignUpEnabled: true,  // セルフサインアップを有効化
      
      // ユーザー招待メッセージ
      userInvitation: {
        emailSubject: '画像管理システムへの招待',
        emailBody: 'こんにちは、{username}さん。画像管理システムへようこそ。<br><br>仮パスワード: {####}<br><br>初回ログイン時にパスワードの変更が必要です。',
      },
      
      // ユーザー検証メッセージ
      userVerification: {
        emailSubject: 'メールアドレスの確認',
        emailBody: '確認コード: {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      
      // 削除保護
      deletionProtection: environment === 'prd',
      
      // 削除ポリシー
      removalPolicy: environment === 'prd'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ===================================
    // Cognito App Client
    // ===================================
    
    this.userPoolClient = this.userPool.addClient('WebAppClient', {
      userPoolClientName: `ImageManagement-WebApp-${environment}`,
      
      // 認証フロー
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },
      
      // OAuth設定
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
      },
      
      // トークン有効期限
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // セキュリティ設定
      preventUserExistenceErrors: true,
    });

    // ===================================
    // ユーザーグループ
    // ===================================
    
    // System_Admin グループ
    this.systemAdminGroup = new cognito.CfnUserPoolGroup(this, 'SystemAdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'System_Admin',
      description: 'システム管理者 - 全ユーザーの画像の完全な管理権限',
      precedence: 1,
    });

    // Image_Manager グループ
    this.imageManagerGroup = new cognito.CfnUserPoolGroup(this, 'ImageManagerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Image_Manager',
      description: '画像管理者 - 全ユーザーの画像の閲覧・公開状態制御・ダウンロード権限',
      precedence: 2,
    });

    // Regular_User グループ
    this.regularUserGroup = new cognito.CfnUserPoolGroup(this, 'RegularUserGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'Regular_User',
      description: '一般ユーザー - 自分の画像のみの管理権限',
      precedence: 3,
    });

    // ===================================
    // Post Confirmation Lambda Trigger
    // ===================================
    
    // サインアップ後に自動的にRegular_Userグループに追加するLambda関数
    const postConfirmationFunction = new lambda.Function(this, 'PostConfirmationFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: 'triggers/post-confirmation.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/dist')),
      functionName: `ImageManagement-PostConfirmation-${environment}`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        LOG_LEVEL: environment === 'prd' ? 'INFO' : 'DEBUG',
      },
    });

    // Post Confirmation Lambda関数にCognitoグループ追加権限を付与
    // ワイルドカードを使用して循環依存を回避
    postConfirmationFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminAddUserToGroup',
      ],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
    }));

    // Lambda関数にCognitoからの呼び出し権限を付与（ワイルドカードで循環依存回避）
    postConfirmationFunction.addPermission('CognitoInvoke', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
    });

    // User PoolにLambda Triggerを設定
    const cfnUserPool = this.userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.lambdaConfig = {
      postConfirmation: postConfirmationFunction.functionArn,
    };

    // ===================================
    // Outputs
    // ===================================
    
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${this.stackName}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `${this.stackName}-UserPoolArn`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${this.stackName}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      description: 'Cognito User Pool Domain',
    });
  }
}
