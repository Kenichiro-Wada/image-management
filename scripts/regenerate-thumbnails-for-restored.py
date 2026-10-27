#!/usr/bin/env python3
"""復元された250件の画像のサムネイルを再生成する"""
import subprocess, json

PROFILE = "wada-sso-dev"
REGION = "us-west-2"
BUCKET = "image-management-images-dev"
TABLE = "ImageManagement-Images-dev"
LAMBDA = "ImageManagement-ImageResize-dev"
ID_FILE = "/tmp/deleted-images-today.txt"

with open(ID_FILE) as f:
    target_ids = [line.strip() for line in f if line.strip()]

print(f"サムネイル再生成対象: {len(target_ids)} 件", flush=True)

success = 0
errors = 0

for i, image_id in enumerate(target_ids):
    # DynamoDBからs3Keyを取得
    pk = f"IMAGE#{image_id}"
    cmd = [
        "aws", "dynamodb", "get-item",
        "--table-name", TABLE,
        "--key", json.dumps({"PK": {"S": pk}, "SK": {"S": "METADATA"}}),
        "--projection-expression", "s3Key",
        "--profile", PROFILE, "--region", REGION, "--output", "json",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    item = data.get("Item", {})
    s3_key = item.get("s3Key", {}).get("S", "")

    if not s3_key:
        print(f"[{i+1}/{len(target_ids)}] s3Keyなし: {image_id}", flush=True)
        errors += 1
        continue

    # Lambda invoke
    import urllib.parse
    encoded_key = urllib.parse.quote(s3_key, safe="/")
    payload = json.dumps({
        "Records": [{
            "s3": {
                "bucket": {"name": BUCKET},
                "object": {"key": encoded_key}
            }
        }]
    })

    invoke_cmd = [
        "aws", "lambda", "invoke",
        "--function-name", LAMBDA,
        "--payload", payload,
        "--cli-binary-format", "raw-in-base64-out",
        "--profile", PROFILE, "--region", REGION,
        "/tmp/lambda-thumb-response.json",
    ]
    invoke_result = subprocess.run(invoke_cmd, capture_output=True, text=True)

    if invoke_result.returncode == 0:
        success += 1
        if (i + 1) % 10 == 0:
            print(f"[{i+1}/{len(target_ids)}] 処理中...", flush=True)
    else:
        errors += 1
        print(f"[{i+1}/{len(target_ids)}] エラー: {image_id}", flush=True)

print(flush=True)
print("=========================================", flush=True)
print(f"サムネイル再生成完了", flush=True)
print(f"成功: {success} 件", flush=True)
print(f"エラー: {errors} 件", flush=True)
print("=========================================", flush=True)
