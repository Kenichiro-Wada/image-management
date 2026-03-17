# API仕様書

## 概要

画像管理システムのREST API仕様書です。

## ベースURL

- **開発環境**: `https://api-dev.example.com`
- **本番環境**: `https://api.example.com`

## 認証

管理画面APIは、AWS Cognitoによる認証が必要です。

```
Authorization: Bearer <JWT_TOKEN>
```

## エンドポイント一覧

### 管理画面API

#### 認証

##### POST /api/admin/auth/login
ログイン

**リクエスト**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス**
```json
{
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "userId": "user-id",
      "email": "user@example.com",
      "role": "System_Admin"
    }
  }
}
```

##### GET /api/admin/auth/verify
トークン検証

**レスポンス**
```json
{
  "data": {
    "valid": true,
    "userId": "user-id"
  }
}
```

##### GET /api/admin/auth/user
ユーザー情報取得

**レスポンス**
```json
{
  "data": {
    "userId": "user-id",
    "email": "user@example.com",
    "role": "System_Admin",
    "groups": ["System_Admin"]
  }
}
```

#### 画像管理

##### POST /api/admin/images/upload
画像アップロード

**リクエスト**
- Content-Type: `multipart/form-data`
- Body: `file` (JPEG形式のみ)

**レスポンス**
```json
{
  "data": {
    "imageId": "image-id",
    "fileName": "example.jpg",
    "s3Key": "images/example.jpg",
    "uploadedAt": "2024-01-01T00:00:00Z"
  }
}
```

##### GET /api/admin/images
画像一覧取得

**クエリパラメータ**
- `page`: ページ番号（デフォルト: 1）
- `userId`: ユーザーIDでフィルタリング（オプション）

**レスポンス**
```json
{
  "data": {
    "images": [
      {
        "imageId": "image-id",
        "fileName": "example.jpg",
        "fileSize": 1000000,
        "mimeType": "image/jpeg",
        "width": 1920,
        "height": 1080,
        "uploadedAt": "2024-01-01T00:00:00Z",
        "capturedAt": "2024-01-01T00:00:00Z",
        "tags": ["tag1", "tag2"],
        "isPublic": true,
        "ownerId": "user-id",
        "ownerName": "User Name",
        "s3Key": "images/example.jpg",
        "thumbnailKeys": {
          "small": "thumbnails/small/example.jpg",
          "medium": "thumbnails/medium/example.jpg",
          "large": "thumbnails/large/example.jpg"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "pageSize": 50,
      "totalCount": 100,
      "totalPages": 2,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

##### DELETE /api/admin/images/:id
画像削除

**レスポンス**
```json
{
  "data": {
    "message": "画像を削除しました",
    "imageId": "image-id"
  }
}
```

##### DELETE /api/admin/images/bulk
一括削除

**リクエスト**
```json
{
  "imageIds": ["image-id-1", "image-id-2"]
}
```

**レスポンス**
```json
{
  "data": {
    "message": "一括削除処理が完了しました",
    "results": {
      "success": ["image-id-1", "image-id-2"],
      "failed": []
    },
    "summary": {
      "total": 2,
      "success": 2,
      "failed": 0
    }
  }
}
```

##### GET /api/admin/images/:id/download
画像ダウンロード

**レスポンス**
- Content-Type: `image/jpeg`
- Body: 画像バイナリ

##### POST /api/admin/images/download/bulk
一括ダウンロード

**リクエスト**
```json
{
  "imageIds": ["image-id-1", "image-id-2"]
}
```

**レスポンス**
- Content-Type: `application/zip`
- Body: ZIPファイル

##### PATCH /api/admin/images/:id/visibility
公開状態変更

**リクエスト**
```json
{
  "isPublic": true
}
```

**レスポンス**
```json
{
  "data": {
    "message": "公開状態を変更しました",
    "imageId": "image-id",
    "isPublic": true
  }
}
```

#### タグ管理

##### POST /api/admin/images/:id/tags
タグ追加

**リクエスト**
```json
{
  "tagName": "新しいタグ"
}
```

**レスポンス**
```json
{
  "data": {
    "message": "タグを追加しました",
    "imageId": "image-id",
    "tagName": "新しいタグ"
  }
}
```

##### DELETE /api/admin/images/:id/tags/:tagName
タグ削除

**レスポンス**
```json
{
  "data": {
    "message": "タグを削除しました",
    "imageId": "image-id",
    "tagName": "削除したタグ"
  }
}
```

##### GET /api/admin/tags/autocomplete
タグオートコンプリート

**クエリパラメータ**
- `q`: 検索クエリ

**レスポンス**
```json
{
  "data": {
    "tags": [
      {
        "tagName": "風景",
        "count": 10
      }
    ]
  }
}
```

### ビューアーAPI

##### GET /api/viewer/images
公開画像一覧取得

**クエリパラメータ**
- `limit`: 取得件数（デフォルト: 20、最大: 100）
- `cursor`: ページネーションカーソル（オプション）

**レスポンス**
```json
{
  "data": {
    "images": [...],
    "pagination": {
      "limit": 20,
      "cursor": "base64-encoded-cursor",
      "hasMore": true
    }
  }
}
```

##### GET /api/viewer/images/search
画像検索

**クエリパラメータ**
- `keyword`: キーワード検索
- `tags`: タグフィルター（カンマ区切り）
- `startDate`: 撮影日開始
- `endDate`: 撮影日終了
- `limit`: 取得件数

**レスポンス**
```json
{
  "data": {
    "images": [...],
    "pagination": {
      "limit": 20,
      "cursor": "base64-encoded-cursor",
      "hasMore": true
    }
  }
}
```

## エラーレスポンス

```json
{
  "error": {
    "message": "エラーメッセージ",
    "code": "ERROR_CODE",
    "details": {},
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### エラーコード

| ステータスコード | 説明 |
|---|---|
| 400 | Bad Request - リクエストが不正 |
| 401 | Unauthorized - 認証が必要 |
| 403 | Forbidden - 権限がない |
| 404 | Not Found - リソースが見つからない |
| 500 | Internal Server Error - サーバーエラー |

## レート制限

- 管理画面API: 1000リクエスト/時間
- ビューアーAPI: 10000リクエスト/時間
