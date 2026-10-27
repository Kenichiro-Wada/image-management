#!/usr/bin/env python3
"""PITRで復元したテーブルから削除された画像のレコードを元テーブルに書き戻す"""

import json
import subprocess

PROFILE = "wada-sso-dev"
REGION = "us-west-2"
SOURCE_TABLE = "ImageManagement-Images-dev-restore"
TARGET_TABLE = "ImageManagement-Images-dev"
ID_FILE = "/tmp/deleted-images-today.txt"

# 削除されたimageIdを読み込み
with open(ID_FILE) as f:
    target_ids = [line.strip() for line in f if line.strip()]

print(f"復元対象imageId: {len(target_ids)} 件")

restored = 0
errors = 0
total_records = 0

for i, image_id in enumerate(target_ids):
    pk = f"IMAGE#{image_id}"

    # 復元テーブルからこのimageIdの全レコードを取得（METADATA, RATING#xxx等）
    cmd = [
        "aws", "dynamodb", "query",
        "--table-name", SOURCE_TABLE,
        "--key-condition-expression", "PK = :pk",
        "--expression-attribute-values", json.dumps({":pk": {"S": pk}}),
        "--profile", PROFILE,
        "--region", REGION,
        "--output", "json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"[{i+1}/{len(target_ids)}] クエリ失敗: {image_id} - {result.stderr}")
        errors += 1
        continue

    data = json.loads(result.stdout)
    items = data.get("Items", [])

    if not items:
        print(f"[{i+1}/{len(target_ids)}] レコードなし: {image_id}")
        errors += 1
        continue

    # 各レコードを元テーブルに書き戻す
    for item in items:
        put_cmd = [
            "aws", "dynamodb", "put-item",
            "--table-name", TARGET_TABLE,
            "--item", json.dumps(item),
            "--profile", PROFILE,
            "--region", REGION,
        ]
        put_result = subprocess.run(put_cmd, capture_output=True, text=True)

        if put_result.returncode != 0:
            sk = item.get("SK", {}).get("S", "?")
            print(f"  書き戻し失敗: {pk} / {sk} - {put_result.stderr}")
            errors += 1
        else:
            total_records += 1

    print(f"[{i+1}/{len(target_ids)}] 復元成功: {image_id} ({len(items)}レコード)")
    restored += 1

print()
print("=========================================")
print("DynamoDBレコード復元完了")
print(f"imageId: {len(target_ids)} 件")
print(f"復元成功: {restored} 件")
print(f"書き戻しレコード数: {total_records}")
print(f"エラー: {errors} 件")
print("=========================================")
