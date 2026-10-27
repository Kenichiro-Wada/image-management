#!/usr/bin/env python3
"""今日削除された画像をS3から復元するスクリプト"""

import subprocess
import json

PROFILE = "wada-sso-dev"
BUCKET = "image-management-images-dev"
REGION = "us-west-2"
ID_FILE = "/tmp/deleted-images-today.txt"

# 削除されたimageIdを読み込み
with open(ID_FILE) as f:
    target_ids = set(line.strip() for line in f if line.strip())

print(f"復元対象: {len(target_ids)} 件")
print("S3からDeleteMarker一覧を取得中...")

# S3のDeleteMarkerを全取得（ページネーション対応）
delete_markers = []
next_key = None
next_version = None

while True:
    cmd = [
        "aws", "s3api", "list-object-versions",
        "--bucket", BUCKET,
        "--prefix", "images/",
        "--profile", PROFILE,
        "--region", REGION,
        "--output", "json",
    ]
    if next_key:
        cmd.extend(["--key-marker", next_key])
    if next_version:
        cmd.extend(["--version-id-marker", next_version])

    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)

    for dm in data.get("DeleteMarkers", []):
        if dm.get("IsLatest", False):
            # imageIdをキーから抽出
            parts = dm["Key"].split("/")
            if len(parts) >= 3:
                img_id = parts[2]
                if img_id in target_ids:
                    delete_markers.append({
                        "key": dm["Key"],
                        "versionId": dm["VersionId"],
                        "imageId": img_id,
                    })

    if data.get("IsTruncated", False):
        next_key = data.get("NextKeyMarker", "")
        next_version = data.get("NextVersionIdMarker", "")
    else:
        break

print(f"DeleteMarker検出: {len(delete_markers)} 件")

# DeleteMarkerを削除して復元
restored = 0
errors = 0

for i, dm in enumerate(delete_markers):
    cmd = [
        "aws", "s3api", "delete-object",
        "--bucket", BUCKET,
        "--key", dm["key"],
        "--version-id", dm["versionId"],
        "--profile", PROFILE,
        "--region", REGION,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        restored += 1
        print(f"[{i+1}/{len(delete_markers)}] 復元成功: {dm['key']}")
    else:
        errors += 1
        print(f"[{i+1}/{len(delete_markers)}] 復元失敗: {dm['key']} - {result.stderr}")

print()
print("=========================================")
print("S3画像復元完了")
print(f"DeleteMarker検出: {len(delete_markers)} 件")
print(f"復元: {restored} 件")
print(f"エラー: {errors} 件")
print(f"未検出: {len(target_ids) - len(delete_markers)} 件")
print("=========================================")
