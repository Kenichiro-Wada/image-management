import { PostConfirmationTriggerHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

/**
 * Cognito Post Confirmation Trigger
 * 
 * ユーザーがサインアップして確認コードを入力した後に実行される
 * 自動的にRegular_Userグループに追加する
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  console.log('Post Confirmation Trigger:', JSON.stringify(event, null, 2));

  const { userPoolId, userName } = event;
  const groupName = 'Regular_User';

  try {
    // ユーザーをRegular_Userグループに追加
    const command = new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: userName,
      GroupName: groupName,
    });

    await cognitoClient.send(command);

    console.log(`Successfully added user ${userName} to group ${groupName}`);
  } catch (error) {
    console.error('Error adding user to group:', error);
    // エラーが発生してもサインアップは成功させる
    // グループ追加は後で手動で行える
  }

  // イベントをそのまま返す（必須）
  return event;
};
