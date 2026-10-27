#!/bin/bash
# 既存画像のサムネイルを再生成するスクリプト

PROFILE="wada-sso-dev"
BUCKET="image-management-images-dev"
LAMBDA_FUNCTION="ImageManagement-ImageResize-dev"
REGION="us-west-2"

echo "S3から画像一覧を取得中..."
KEYS=$(aws s3 ls s3://${BUCKET}/images/ --recursive --profile ${PROFILE} | awk '{print $4}')

TOTAL=$(echo "$KEYS" | wc -l | tr -d ' ')
echo "合計 ${TOTAL} 枚の画像を処理します"

COUNT=0
ERRORS=0

for KEY in $KEYS; do
  COUNT=$((COUNT + 1))

  ENCODED_KEY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${KEY}', safe='/'))")

  PAYLOAD="{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"${BUCKET}\"},\"object\":{\"key\":\"${ENCODED_KEY}\"}}}]}"

  echo "[${COUNT}/${TOTAL}] 処理中: ${KEY}"

  RESULT=$(aws lambda invoke \
    --function-name ${LAMBDA_FUNCTION} \
    --payload "${PAYLOAD}" \
    --cli-binary-format raw-in-base64-out \
    --profile ${PROFILE} \
    --region ${REGION} \
    /tmp/lambda-response.json 2>&1)

  STATUS=$?
  if [ $STATUS -ne 0 ]; then
    echo "  エラー: ${RESULT}"
    ERRORS=$((ERRORS + 1))
  else
    FUNC_ERROR=$(python3 -c "import json; f=open('/tmp/lambda-response.json'); d=json.load(f); print(d.get('FunctionError','') if isinstance(d,dict) else '')" 2>/dev/null)
    if [ -n "$FUNC_ERROR" ] && [ "$FUNC_ERROR" != "None" ]; then
      echo "  Lambda エラー"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  if [ $((COUNT % 20)) -eq 0 ]; then
    echo "  --- ${COUNT}/${TOTAL} 完了 ---"
    sleep 1
  fi
done

echo ""
echo "========================================="
echo "サムネイル再生成完了"
echo "合計: ${TOTAL} 枚"
echo "成功: $((TOTAL - ERRORS)) 枚"
echo "エラー: ${ERRORS} 枚"
echo "========================================="
