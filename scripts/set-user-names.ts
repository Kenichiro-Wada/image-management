import { CognitoIdentityProviderClient, ListUsersCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as readline from 'readline';

// 環境変数
const REGION = 'us-west-2';
const USER_POOL_ID = 'us-west-2_KNCOUiUZM';

// クライアントの初期化
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

// 標準入力インターフェース
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * ユーザー入力を取得
 */
function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Cognitoユーザーのname属性を更新
 */
async function updateUserName(username: string, name: string): Promise<void> {
  try {
    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      UserAttributes: [
        {
          Name: 'name',
          Value: name,
        },
      ],
    });
    
    await cognitoClient.send(command);
    console.log(`  ✓ ${username} のname属性を「${name}」に更新しました`);
  } catch (error) {
    console.error(`  ✗ ${username} の更新に失敗しました:`, error);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('=== Cognitoユーザーのname属性設定スクリプト ===\n');
  
  try {
    // Cognitoからユーザー一覧を取得
    console.log('1. Cognitoからユーザー一覧を取得中...\n');
    const command = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
    });
    
    const response = await cognitoClient.send(command);
    
    if (!response.Users || response.Users.length === 0) {
      console.log('ユーザーが見つかりませんでした');
      rl.close();
      return;
    }
    
    console.log(`${response.Users.length} 人のユーザーが見つかりました\n`);
    
    // 各ユーザーのname属性を設定
    for (const user of response.Users) {
      const username = user.Username;
      const emailAttr = user.Attributes?.find(attr => attr.Name === 'email');
      const nameAttr = user.Attributes?.find(attr => attr.Name === 'name');
      const email = emailAttr?.Value || 'N/A';
      const currentName = nameAttr?.Value || '（未設定）';
      
      console.log(`\nユーザー: ${username}`);
      console.log(`メールアドレス: ${email}`);
      console.log(`現在のname属性: ${currentName}`);
      
      // name属性が既に設定されている場合はスキップするか確認
      if (nameAttr?.Value) {
        const shouldUpdate = await question('name属性は既に設定されています。更新しますか？ (y/N): ');
        if (shouldUpdate.toLowerCase() !== 'y') {
          console.log('  スキップしました');
          continue;
        }
      }
      
      // 新しいname属性を入力
      const newName = await question('新しいname属性を入力してください（空欄でスキップ）: ');
      
      if (!newName.trim()) {
        console.log('  スキップしました');
        continue;
      }
      
      // name属性を更新
      await updateUserName(username!, newName.trim());
    }
    
    console.log('\n=== 完了 ===');
  } catch (error) {
    console.error('スクリプト実行エラー:', error);
  } finally {
    rl.close();
  }
}

// スクリプト実行
main();
