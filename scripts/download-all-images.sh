#!/bin/bash
# S3から全画像をローカルにダウンロードするスクリプト

PROFILE="wada-sso-dev"
BUCKET="image-management-images-dev"
OUTPUT_DIR="$HOME/Pictures/image-management-backup"

echo "ダウンロード先: ${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

echo "S3から画像をダウンロード中..."
aws s3 sync "s3://${BUCKET}/images/" "${OUTPUT_DIR}/" --profile ${PROFILE} --exclude "*" --include "*.jpg" --include "*.jpeg" --include "*.JPG" --include "*.JPEG"

# S3のディレクトリ構造をフラットにする（OUTPUT_DIR直下にファイルを移動）
echo "ファイルをフラット化中..."
find "${OUTPUT_DIR}" -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) | while read FILE; do
  BASENAME=$(basename "$FILE")
  DEST="${OUTPUT_DIR}/${BASENAME}"
  # 同名ファイルがある場合はサフィックスを付与
  if [ "$FILE" != "$DEST" ]; then
    if [ -f "$DEST" ]; then
      NAME="${BASENAME%.*}"
      EXT="${BASENAME##*.}"
      COUNT=1
      while [ -f "${OUTPUT_DIR}/${NAME}_${COUNT}.${EXT}" ]; do
        COUNT=$((COUNT + 1))
      done
      DEST="${OUTPUT_DIR}/${NAME}_${COUNT}.${EXT}"
    fi
    mv "$FILE" "$DEST"
  fi
done

# 空ディレクトリを削除
find "${OUTPUT_DIR}" -type d -empty -delete 2>/dev/null

echo ""
echo "========================================="
echo "ダウンロード完了"
echo "保存先: ${OUTPUT_DIR}"
echo "ファイル数: $(find "${OUTPUT_DIR}" -type f | wc -l | tr -d ' ')"
echo "合計サイズ: $(du -sh "${OUTPUT_DIR}" | cut -f1)"
echo "========================================="
