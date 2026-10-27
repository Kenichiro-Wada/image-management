#!/bin/bash
# 既存画像のサムネイルを再生成するスクリプト（残り分 + 並列実行対応）

PROFILE="wada-sso-dev"
BUCKET="image-management-images-dev"
LAMBDA_FUNCTION="ImageManagement-ImageResize-dev"
REGION="us-west-2"
SKIP=${1:-0}        # スキップする枚数（デフォルト0 = 全件処理）
PARALLEL=${2:-5}    # 並列数（デフォルト5）

echo "S3から画像一覧を取得中..."
KEYS=$(aws s3 ls s3://${BUCKET}/images/ --recursive --profile ${PROFILE} | awk '{print $4}')

TOTAL=$(echo "$KEYS" | wc -l | tr -d ' ')
echo "合計 ${TOTAL} 枚（${SKIP}枚スキップ、並列数: ${PARALLEL}）"

COUNT=0
ERRORS=0
PROCESSED=0

process_image() {
  local KEY=$1
  local IDX=$2
  local TOTAL=$3

  ENCODED_KEY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${KEY}', safe='/'))")
  PAYLOAD="{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"${BUCKET}\"},\"object\":{\"key\":\"${ENCODED_KEY}\"}}}]}"

  echo "[${IDX}/${TOTAL}] 処理中: ${KEY}"

  RESULT=$(aws lambda invoke \
    --function-name ${LAMBDA_FUNCTION} \
    --payload "${PAYLOAD}" \
    --cli-binary-format raw-in-base64-out \
    --profile ${PROFILE} \
    --region ${REGION} \
    /tmp/lambda-response-${IDX}.json 2>&1)

  STATUS=$?
  if [ $STATUS -ne 0 ]; then
    echo "  エラー: ${RESULT}"
    return 1
  fi
  return 0
}

export -f process_image
export BUCKET LAMBDA_FUNCTION PROFILE REGION

for KEY in $KEYS; do
  COUNT=$((COUNT + 1))

  # スキップ処理
  if [ $COUNT -le $SKIP ]; then
    continue
  fi

  PROCESSED=$((PROCESSED + 1))

  process_image "$KEY" "$COUNT" "$TOTAL" &

  # 並列数制御
  if [ $((PROCESSED % PARALLEL)) -eq 0 ]; then
    wait
    echo "  --- ${COUNT}/${TOTAL} 完了 ---"
  fi
done

# 残りのバックグラウンドジョブを待つ
wait

echo ""
echo "========================================="
echo "サムネイル再生成完了"
echo "スキップ: ${SKIP} 枚"
echo "処理: ${PROCESSED} 枚"
echo "========================================="
