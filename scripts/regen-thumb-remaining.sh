#!/bin/bash
# 復元画像のサムネイル再生成（81番目以降）

PROFILE="wada-sso-dev"
BUCKET="image-management-images-dev"
LAMBDA_FUNCTION="ImageManagement-ImageResize-dev"
REGION="us-west-2"
TABLE="ImageManagement-Images-dev"
ID_FILE="/tmp/deleted-images-today.txt"
SKIP=80

COUNT=0
PROCESSED=0
ERRORS=0

while IFS= read -r IMAGE_ID; do
  COUNT=$((COUNT + 1))
  if [ $COUNT -le $SKIP ]; then
    continue
  fi
  PROCESSED=$((PROCESSED + 1))

  S3KEY=$(aws dynamodb get-item --table-name ${TABLE} --key "{\"PK\":{\"S\":\"IMAGE#${IMAGE_ID}\"},\"SK\":{\"S\":\"METADATA\"}}" --projection-expression "s3Key" --profile ${PROFILE} --region ${REGION} --output json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('Item',{}).get('s3Key',{}).get('S',''))" 2>/dev/null)

  if [ -z "$S3KEY" ]; then
    echo "[${COUNT}/250] s3Keyなし: ${IMAGE_ID}"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  ENCODED_KEY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${S3KEY}', safe='/'))")
  PAYLOAD="{\"Records\":[{\"s3\":{\"bucket\":{\"name\":\"${BUCKET}\"},\"object\":{\"key\":\"${ENCODED_KEY}\"}}}]}"

  aws lambda invoke \
    --function-name ${LAMBDA_FUNCTION} \
    --payload "${PAYLOAD}" \
    --cli-binary-format raw-in-base64-out \
    --profile ${PROFILE} \
    --region ${REGION} \
    /tmp/lambda-thumb-resp.json > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    if [ $((PROCESSED % 10)) -eq 0 ]; then
      echo "[${COUNT}/250] 処理中... (${PROCESSED}件完了)"
    fi
  else
    echo "[${COUNT}/250] エラー: ${IMAGE_ID}"
    ERRORS=$((ERRORS + 1))
  fi
done < "$ID_FILE"

echo ""
echo "========================================="
echo "サムネイル再生成完了"
echo "処理: ${PROCESSED} 件"
echo "エラー: ${ERRORS} 件"
echo "========================================="
