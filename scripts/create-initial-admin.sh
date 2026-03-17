#!/bin/bash

# 初期管理ユーザー作成スクリプト
# 使用方法: ./scripts/create-initial-admin.sh <user-pool-id> <email> <profile>

set -e

USER_POOL_ID=$1
EMAIL=$2
PROFILE=${3:-default}

if [ -z "$USER_POOL_ID" ] || [ -z "$EMAIL" ]; then
  echo "使用方法: $0 <user-pool-id> <email> [profile]"
  echo "例: $0 us-west-2_KNCOUiUZM admin@example.com wada-sso-dev"
  exit 1
fi

echo "初期管理ユーザーを作成します..."
echo "User Pool ID: $USER_POOL_ID"
echo "Email: $EMAIL"
echo "Profile: $PROFILE"
echo ""

# ユーザーの作成
echo "ユーザーを作成中..."
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --profile "$PROFILE"

echo ""
echo "ユーザーをSystem_Adminグループに追加中..."
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --group-name System_Admin \
  --profile "$PROFILE"

echo ""
echo "✅ 初期管理ユーザーの作成が完了しました！"
echo ""
echo "ユーザー名（メールアドレス）: $EMAIL"
echo "メールアドレス: $EMAIL"
echo "グループ: System_Admin"
echo ""
echo "仮パスワードが $EMAIL に送信されました。"
echo "初回ログイン時にパスワードの変更が必要です。"
