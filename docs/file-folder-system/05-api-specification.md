# File/Folder System - API Specification

## Base URL

```
https://your-api-domain.com/api/v1/admin/content
```

## Authentication

All endpoints require admin authentication via JWT token.

**Header:**
```
Authorization: Bearer <jwt_token>
```

---

## File Endpoints

### 1. List Files by Course

Get all files for a specific course, optionally filtered by language.

**Endpoint:** `GET /files`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `courseId` | string | Yes | MongoDB ObjectId of the course |
| `language` | string | No | Filter by language (e.g., "en", "es") |
| `type` | string | No | Filter by type ("hls" or "transcript") |

**Request:**
```http
GET /api/v1/admin/content/files?courseId=abc123def456abc123def456&language=en
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "Files retrieved successfully",
  "data": {
    "files": [
      {
        "_id": "file123abc456def789",
        "name": "Session 1 - Introduction",
        "courseId": "abc123def456abc123def456",
        "language": "en",
        "type": "hls",
        "s3Keys": {
          "master": "courses/abc123def456abc123def456/en/master.m3u8",
          "qualities": {
            "1080p": "courses/abc123def456abc123def456/en/1080p/index.m3u8",
            "720p": "courses/abc123def456abc123def456/en/720p/index.m3u8",
            "480p": "courses/abc123def456abc123def456/en/480p/index.m3u8"
          },
          "transcript": {
            "srt": "courses/abc123def456abc123def456/en/transcript.srt",
            "txt": "courses/abc123def456abc123def456/en/transcript.txt",
            "json": "courses/abc123def456abc123def456/en/transcript.json"
          }
        },
        "duration": 1245,
        "qualities": ["1080p", "720p", "480p"],
        "thumbnail": null,
        "uploadedBy": "python-encoder",
        "linkedSessions": [],
        "isDeleted": false,
        "createdAt": "2026-02-04T10:30:00.000Z",
        "updatedAt": "2026-02-04T10:30:00.000Z"
      }
    ],
    "s3Prefix": "courses/abc123def456abc123def456/",
    "availableLanguages": ["en", "es"]
  }
}
```

**Error Responses:**

| Code | Message |
|------|---------|
| 400 | courseId is required |
| 401 | Unauthorized |
| 404 | Course not found |

---

### 2. Get Single File

Get details of a specific file by ID.

**Endpoint:** `GET /files/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the file |

**Request:**
```http
GET /api/v1/admin/content/files/file123abc456def789
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "File retrieved successfully",
  "data": {
    "_id": "file123abc456def789",
    "name": "Session 1 - Introduction",
    "courseId": "abc123def456abc123def456",
    "language": "en",
    "type": "hls",
    "s3Keys": {
      "master": "courses/abc123def456abc123def456/en/master.m3u8",
      "qualities": { ... },
      "transcript": { ... }
    },
    "duration": 1245,
    "qualities": ["1080p", "720p", "480p"],
    "linkedSessions": ["session123", "session456"],
    "createdAt": "2026-02-04T10:30:00.000Z",
    "updatedAt": "2026-02-04T10:30:00.000Z"
  }
}
```

**Error Responses:**

| Code | Message |
|------|---------|
| 401 | Unauthorized |
| 404 | File not found |

---

### 3. Create File

Create a new file record. Called by Python encoder after uploading to S3.

**Endpoint:** `POST /files`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name for the file |
| `courseId` | string | Yes | MongoDB ObjectId of the course |
| `language` | string | Yes | Language code (e.g., "en", "es") |
| `type` | string | No | File type: "hls" (default) or "transcript" |
| `s3Keys` | object | No | S3 key paths (see schema below) |
| `duration` | number | No | Video duration in seconds |
| `qualities` | string[] | No | Available quality levels |
| `thumbnail` | string | No | S3 key for thumbnail image |
| `uploadedBy` | string | No | Uploader identifier (default: "python-encoder") |

**s3Keys Schema:**
```json
{
  "master": "courses/.../master.m3u8",
  "qualities": {
    "1080p": "courses/.../1080p/index.m3u8",
    "720p": "courses/.../720p/index.m3u8",
    "480p": "courses/.../480p/index.m3u8"
  },
  "transcript": {
    "srt": "courses/.../transcript.srt",
    "txt": "courses/.../transcript.txt",
    "json": "courses/.../transcript.json",
    "vtt": "courses/.../transcript.vtt"
  }
}
```

**Request:**
```http
POST /api/v1/admin/content/files
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Session 1 - Introduction",
  "courseId": "abc123def456abc123def456",
  "language": "en",
  "type": "hls",
  "s3Keys": {
    "master": "courses/abc123def456abc123def456/en/master.m3u8",
    "qualities": {
      "1080p": "courses/abc123def456abc123def456/en/1080p/index.m3u8",
      "720p": "courses/abc123def456abc123def456/en/720p/index.m3u8",
      "480p": "courses/abc123def456abc123def456/en/480p/index.m3u8"
    },
    "transcript": {
      "srt": "courses/abc123def456abc123def456/en/transcript.srt",
      "json": "courses/abc123def456abc123def456/en/transcript.json"
    }
  },
  "duration": 1245,
  "qualities": ["1080p", "720p", "480p"],
  "uploadedBy": "python-encoder"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "code": 201,
  "message": "File created successfully",
  "data": {
    "_id": "file123abc456def789",
    "name": "Session 1 - Introduction",
    "courseId": "abc123def456abc123def456",
    "language": "en",
    "type": "hls",
    "s3Keys": { ... },
    "duration": 1245,
    "qualities": ["1080p", "720p", "480p"],
    "linkedSessions": [],
    "createdAt": "2026-02-04T10:30:00.000Z"
  }
}
```

**Error Responses:**

| Code | Message |
|------|---------|
| 400 | name, courseId, and language are required |
| 401 | Unauthorized |
| 404 | Course not found |

---

### 4. Update File

Update file metadata (name, duration, qualities, thumbnail).

**Endpoint:** `PUT /files/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the file |

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | New display name |
| `duration` | number | Updated duration in seconds |
| `qualities` | string[] | Updated quality levels |
| `thumbnail` | string | S3 key for thumbnail |

**Request:**
```http
PUT /api/v1/admin/content/files/file123abc456def789
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Session 1 - Introduction (Updated)",
  "duration": 1300
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "File updated successfully",
  "data": {
    "_id": "file123abc456def789",
    "name": "Session 1 - Introduction (Updated)",
    "duration": 1300,
    ...
  }
}
```

**Error Responses:**

| Code | Message |
|------|---------|
| 401 | Unauthorized |
| 404 | File not found |

---

### 5. Delete File

Delete a file from database and S3.

**Endpoint:** `DELETE /files/:id`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the file |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `force` | string | Set to "true" to delete even if linked to sessions |

**Request:**
```http
DELETE /api/v1/admin/content/files/file123abc456def789
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "File deleted successfully",
  "data": null
}
```

**Error Responses:**

| Code | Message |
|------|---------|
| 401 | Unauthorized |
| 404 | File not found |
| 409 | Cannot delete: File is linked to X session(s). Use ?force=true to override. |

---

### 6. Link File to Session

Track that a file is being used by a session (for deletion protection).

**Endpoint:** `POST /files/:id/link`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | MongoDB ObjectId of the file |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | MongoDB ObjectId of the session |

**Request:**
```http
POST /api/v1/admin/content/files/file123abc456def789/link
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "session123abc456def789"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "File linked to session",
  "data": {
    "_id": "file123abc456def789",
    "linkedSessions": ["session123abc456def789"],
    ...
  }
}
```

---

### 7. Unlink File from Session

Remove a session reference from the file's linkedSessions array.

**Endpoint:** `POST /files/:id/unlink`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | MongoDB ObjectId of the session |

**Request:**
```http
POST /api/v1/admin/content/files/file123abc456def789/unlink
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "session123abc456def789"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "File unlinked from session",
  "data": {
    "_id": "file123abc456def789",
    "linkedSessions": [],
    ...
  }
}
```

---

### 8. Get Folder Path

Get the S3 folder path for a course (used by Python encoder).

**Endpoint:** `GET /files/folder-path/:courseId`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | string | MongoDB ObjectId of the course |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | string | Language code (default: "en") |

**Request:**
```http
GET /api/v1/admin/content/files/folder-path/abc123def456abc123def456?language=en
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "Folder path retrieved successfully",
  "data": {
    "courseId": "abc123def456abc123def456",
    "courseName": { "en": "Introduction to Bible Study" },
    "language": "en",
    "folderPath": "courses/abc123def456abc123def456/en",
    "s3Prefix": "courses/abc123def456abc123def456/en/"
  }
}
```

---

## AWS Endpoints

### 9. Get Presigned URL (Exact Key)

Generate a presigned upload URL for an exact S3 key (no timestamp/sanitization).

**Endpoint:** `POST /aws/uploadUrlExact`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Exact S3 key to upload to |
| `contentType` | string | No | Content-Type header for the upload |

**Request:**
```http
POST /api/v1/admin/content/aws/uploadUrlExact
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "courses/abc123def456abc123def456/en/master.m3u8",
  "contentType": "application/vnd.apple.mpegurl"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "code": 200,
  "message": "Upload URL generated successfully",
  "data": {
    "key": "courses/abc123def456abc123def456/en/master.m3u8",
    "signedUrl": "https://bucket.s3.region.amazonaws.com/courses/...?X-Amz-Algorithm=...",
    "downloadUrl": "https://bucket.s3.region.amazonaws.com/courses/..."
  }
}
```

**Error Responses:**

| Code | Message |
|------|---------|
| 400 | key is required |
| 400 | Invalid key format |
| 401 | Unauthorized |

---

## Content-Type Reference

| File Extension | Content-Type |
|----------------|--------------|
| `.m3u8` | `application/vnd.apple.mpegurl` |
| `.ts` | `video/mp2t` |
| `.mp4` | `video/mp4` |
| `.srt` | `text/plain; charset=utf-8` |
| `.txt` | `text/plain; charset=utf-8` |
| `.json` | `application/json` |
| `.vtt` | `text/vtt` |

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "code": 400,
  "message": "Error description here",
  "data": null
}
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `GET /files` | 100 req/min |
| `POST /files` | 30 req/min |
| `POST /aws/uploadUrlExact` | 100 req/min |

---

## Example: Complete Upload Flow

```bash
# 1. Get presigned URL for master playlist
curl -X POST https://api.example.com/api/v1/admin/content/aws/uploadUrlExact \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "courses/abc123/en/master.m3u8", "contentType": "application/vnd.apple.mpegurl"}'

# 2. Upload file to S3 using signedUrl
curl -X PUT "<signedUrl>" \
  -H "Content-Type: application/vnd.apple.mpegurl" \
  --data-binary @master.m3u8

# 3. Repeat for all files...

# 4. Create file record
curl -X POST https://api.example.com/api/v1/admin/content/files \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Session 1 - Introduction",
    "courseId": "abc123def456abc123def456",
    "language": "en",
    "type": "hls",
    "s3Keys": {
      "master": "courses/abc123/en/master.m3u8",
      "qualities": {"1080p": "courses/abc123/en/1080p/index.m3u8"}
    },
    "duration": 1245,
    "qualities": ["1080p"]
  }'
```
