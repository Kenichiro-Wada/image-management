import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { InfraDatabaseStack } from '../lib/infra-database-stack';

describe('InfraDatabaseStack', () => {
  describe('Stack基本設定', () => {
    test('dev環境でStackが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
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
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'prd',
        env: {
          region: 'ap-northeast-1',
        },
      });
      
      // THEN
      expect(stack.stackName).toBe('TestStack');
    });
  });

  describe('DynamoDBテーブル', () => {
    test('3つのDynamoDBテーブルが作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // DynamoDBテーブルが3つ作成されていることを確認
      template.resourceCountIs('AWS::DynamoDB::Table', 3);
    });

    test('画像メタデータテーブルが正しく作成される', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // テーブル名とキー設定を確認
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'ImageManagement-Images-dev',
        KeySchema: [
          {
            AttributeName: 'PK',
            KeyType: 'HASH',
          },
          {
            AttributeName: 'SK',
            KeyType: 'RANGE',
          },
        ],
      });
    });

    test('画像テーブルにGSI1が設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // GSI1の設定を確認
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'ImageManagement-Images-dev',
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              {
                AttributeName: 'GSI1PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI1SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
          {
            IndexName: 'GSI2',
            KeySchema: [
              {
                AttributeName: 'GSI2PK',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'GSI2SK',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ],
      });
    });

    test('オンデマンド課金モードが設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 課金モードを確認
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    test('ポイントインタイムリカバリが有効化されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // PITRを確認
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    test('dev環境では削除保護が無効化されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除保護を確認
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        DeletionProtectionEnabled: false,
      });
    });

    test('prd環境では削除保護が有効化されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'prd',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除保護を確認
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        DeletionProtectionEnabled: true,
      });
    });

    test('dev環境では削除ポリシーがDESTROYに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除ポリシーを確認
      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
    });

    test('prd環境では削除ポリシーがRETAINに設定されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'prd',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // 削除ポリシーを確認
      template.hasResource('AWS::DynamoDB::Table', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });
    });
  });

  describe('Outputs', () => {
    test('すべてのテーブル名がOutputsに出力されている', () => {
      // GIVEN
      const app = new cdk.App();
      
      // WHEN
      const stack = new InfraDatabaseStack(app, 'TestStack', {
        environment: 'dev',
      });
      
      // THEN
      const template = Template.fromStack(stack);
      
      // Outputsを確認
      template.hasOutput('ImagesTableName', {});
      template.hasOutput('TagsTableName', {});
      template.hasOutput('UsersTableName', {});
    });
  });
});
