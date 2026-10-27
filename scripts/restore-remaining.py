#!/usr/bin/env python3
"""残りの画像レコードを復元テーブルから書き戻す"""
import subprocess, json, sys

PROFILE = "wada-sso-dev"
REGION = "us-west-2"
SOURCE_TABLE = "ImageManagement-Images-dev-restore"
TARGET_TABLE = "ImageManagement-Images-dev"

with open("/tmp/remaining-images.txt") as f:
    target_ids = [line.strip() for line in f if line.strip()]

print(f"残り復元対象: {len(target_ids)} 件", flush=True)

restored = 0
errors = 0
total_records = 0

for i, image_id in enumerate(target_ids):
    pk = f"IMAGE#{image_id}"
    cmd = [
        "aws", "dynamodb", "query",
        "--table-name", SOURCE_TABLE,
        "--key-condition-expression", "PK = :pk",
        "--expression-attribute-values", json.dumps({":pk": {"S": pk}}),
        "--profile", PROFILE, "--region", REGION, "--output", "json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[{i+1}/{len(target_ids)}] クエリ失敗: {image_id}", flush=True)
        errors += 1
        continue

    data = json.loads(result.stdout)
    items = data.get("Items", [])
    if not items:
        print(f"[{i+1}/{len(target_ids)}] レコードなし: {image_id}", flush=True)
        errors += 1
        continue

    for item in items:
        put_cmd = [
            "aws", "dynamodb", "put-item",
            "--table-name", TARGET_TABLE,
            "--item", json.dumps(item),
            "--profile", PROFILE, "--region", REGION,
        ]
        put_result = subprocess.run(put_cmd, capture_output=True, text=True)
        if put_result.returncode == 0:
            total_records += 1
        else:
            errors += 1

    print(f"[{i+1}/{len(target_ids)}] 復元成功: {image_id} ({len(items)}レコード)", flush=True)
    restored += 1

print(flush=True)
print("=========================================", flush=True)
print(f"復元成功: {restored} 件", flush=True)
print(f"書き戻しレコード数: {total_records}", flush=True)
print(f"エラー: {errors} 件", flush=True)
print("=========================================", flush=True)
