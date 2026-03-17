import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { CognitoIdentityProviderClient, ListUsersCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

// 環境変数
const REGION = 'us-west-2';
const IMAGES_TABLE = 'ImageManagement-Images-dev';
const USER_POOL_ID = 'us-west-2_KNCOUiUZM';

// クライアントの初期化
const dynamoClient = new DynamoDBClient({ region: REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

/**
 * Cognitoからユーザー情報を取得
 */
async function getCognitoUsers(): Promise<Map<string, string>> {
  const userMap = new Map<string, string>();
  
  try {
    const command = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
    });
    
    const response = await cognitoClient.send(command);
    
    if (response.Users) {
      for (const user of response.Users) {
        // ユーザーIDを取得
        const userIdAttr = user.Attributes?.find(attr => attr.Name === 'sub');
        const userId = userIdAttr?.Value;
        
        if (!userId) continue;
        
        // ユーザー名を取得（優先順位: preferred_username > name > email > Username）
        const preferredUsernameAttr = user.Attributes?.find(attr => attr.Name === 'preferred_username');
        const nameAttr = user.Attributes?.find(attr => attr.Name === 'name');
        const emailAttr = user.Attributes?.find(attr => attr.Name === 'email');
        
        const userName = preferredUsernameAttr?.Value || 
                        nameAttr?.Value || 
                        emailAttr?.Value || 
                        user.Username || 
                        'Unknown User';
        
        userMap.set(userId, userName);
        console.log(`ユーザー取得: ${userId} -> ${userName}`);
      }
    }
    
    console.log(`\n合計 ${userMap.size} 人のユーザーを取得しました\n`);
    return userMap;
  } catch (error) {
    console.error('Cognitoユーザー取得エラー:', error);
    throw error;
  }
}

/**
 * DynamoDBから全画像メタデータを取得
 */
async function getAllImages(): Promise<any[]> {
  const images: any[] = [];
  let lastEvaluatedKey: any = undefined;
  
  try {
    do {
      const command = new ScanCommand({
        TableName: IMAGES_TABLE,
        FilterExpression: 'SK = :metadata',
        ExpressionAttributeValues: marshall({
          ':metadata': 'METADATA',
        }),
        ExclusiveStartKey: lastEvaluatedKey,
      });
      
      const response = await dynamoClient.send(command);
      
      if (response.Items) {
        const items = response.Items.map(item => unmarshall(item));
        images.push(...items);
      }
      
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    console.log(`合計 ${images.length} 件の画像を取得しました\n`);
    return images;
  } catch (error) {
    console.error('画像取得エラー:', error);
    throw error;
  }
}

/**
 * 画像のownerNameを更新
 */
async function updateOwnerName(imageId: string, ownerId: string, newOwnerName: string): Promise<void> {
  try {
    const command = new UpdateItemCommand({
      TableName: IMAGES_TABLE,
      Key: marshall({
        PK: `IMAGE#${imageId}`,
        SK: 'METADATA',
      }),
      UpdateExpression: 'SET ownerName = :ownerName',
      ExpressionAttributeValues: marshall({
        ':ownerName': newOwnerName,
      }),
    });
    
    await dynamoClient.send(command);
  } catch (error) {
    console.error(`画像 ${imageId} の更新エラー:`, error);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('=== 画像のownerName修正スクリプト開始 ===\n');
  
  // Cognitoからユーザー情報を取得
  console.log('1. Cognitoからユーザー情報を取得中...');
  const userMap = await getCognitoUsers();
  
  // DynamoDBから全画像を取得
  console.log('2. DynamoDBから画像情報を取得中...');
  const images = await getAllImages();
  
  // 更新が必要な画像をフィルタリング
  const imagesToUpdate = images.filter(image => {
    const currentOwnerName = image.ownerName || '';
    const correctOwnerName = userMap.get(image.ownerId);
    
    // Cognitoにユーザーが存在し、かつownerNameが異なる場合
    return correctOwnerName && currentOwnerName !== correctOwnerName;
  });
  
  console.log(`3. 更新が必要な画像: ${imagesToUpdate.length} 件\n`);
  
  if (imagesToUpdate.length === 0) {
    console.log('更新が必要な画像はありません');
    return;
  }
  
  // 確認メッセージ
  console.log('以下の画像を更新します:');
  imagesToUpdate.forEach((image, index) => {
    const correctOwnerName = userMap.get(image.ownerId);
    console.log(`  ${index + 1}. ${image.fileName} (${image.imageId})`);
    console.log(`     現在: "${image.ownerName}" -> 更新後: "${correctOwnerName}"`);
  });
  
  console.log('\n4. 画像のownerNameを更新中...');
  
  // 画像を更新
  let successCount = 0;
  let errorCount = 0;
  
  for (const image of imagesToUpdate) {
    const correctOwnerName = userMap.get(image.ownerId);
    if (!correctOwnerName) continue;
    
    try {
      await updateOwnerName(image.imageId, image.ownerId, correctOwnerName);
      successCount++;
      console.log(`  ✓ ${image.fileName} を更新しました (${successCount}/${imagesToUpdate.length})`);
    } catch (error) {
      errorCount++;
      console.error(`  ✗ ${image.fileName} の更新に失敗しました`);
    }
  }
  
  console.log('\n=== 完了 ===');
  console.log(`成功: ${successCount} 件`);
  console.log(`失敗: ${errorCount} 件`);
}

// スクリプト実行
main().catch(error => {
  console.error('スクリプト実行エラー:', error);
  process.exit(1);
});
