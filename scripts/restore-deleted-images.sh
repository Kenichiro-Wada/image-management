#!/bin/bash
# 今日削除された画像をS3から復元するスクリプト
# DeleteMarkerを削除することで復元する

PROFILE="wada-sso-dev"
BUCKET="image-management-images-dev"
REGION="us-west-2"
ID_FILE="/tmp/deleted-images-today.txt"

TOTAL=$(wc -l < "$ID_FILE" | tr -d ' ')
echo "復元対象: ${TOTAL} 件"

COUNT=0
RESTORED=0
ERRORS=0

while IFS= read -r IMAGE_ID; do
  COUNT=$((COUNT + 1))

  # DeleteMarkerを検索
  RESULT=$(aws s3api list-object-versions \
    --bucket ${BUCKET} \
    --prefix "images/" \
    --profile ${PROFILE} \
    --region ${REGION} \
    --output json --max-items 10000 2>&1)

  # imageIdに一致するDeleteMarkerを抽出
  DM_INFO=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
target = '${IMAGE_ID}'
for dm in data.get('DeleteMarkers', []):
    if target in dm.get('Key', '') and dm.get('IsLatest', False):
        print(dm['Key'] + '|' + dm['VersionId'])
        break
" 2>/dev/null)

  if [ -z "$DM_INFO" ]; then
    echo "[${COUNT}/${TOTAL}] スキップ（DeleteMarker未検出）: ${IMAGE_ID}"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  KEY=$(echo "$DM_INFO" | cut -d'|' -f1)
  VERSION_ID=$(echo "$DM_INFO" | cut -d'|' -f2)

  # DeleteMarkerを削除して復元
  aws s3api delete-object \
    --bucket ${BUCKET} \
    --key "${KEY}" \
    --version-id "${VERSION_ID}" \
    --profile ${PROFILE} \
    --region ${REGION} > /dev/null 2>&1

  STATUS=$?
  if [ $STATUS -eq 0 ]; then
    echo "[${COUNT}/${TOTAL}] 復元成功: ${KEY}"
    RESTORED=$((RESTORED + 1))
  else
    echo "[${COUNT}/${TOTAL}] 復元失敗: ${KEY}"
    ERRORS=$((ERRORS + 1))
  fi
done < "$ID_FILE"

echo ""
echo "========================================="
echo "S3画像復元完了"
echo "合計: ${TOTAL} 件"
echo "復元: ${RESTORED} 件"
echo "エラー: ${ERRORS} 件"
echo "========================================="
