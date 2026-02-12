---
name: S3 Upload Complete
overview: "Add S3 upload capability to the Python HLS converter: upload to course-based folders (courses/{courseId}/{language}/), create File records in the backend via defined APIs, with environment variable configuration, retry logic, and resume capability."
todos:
  - id: deps
    content: Add requests>=2.28.0 and python-dotenv>=1.0.0 to requirements.txt
    status: pending
  - id: env-config
    content: Create .env.example and config.py with BACKEND_URL, AUTH_TOKEN, PRESIGN_EXACT_ENDPOINT, FILE_CREATE_ENDPOINT
    status: pending
  - id: s3-uploader
    content: "Create s3_uploader.py with S3UploadManager class: validate_connection, get_presigned_url_exact, upload_file, upload_directory, create_file_record, save/load state"
    status: pending
  - id: ui-s3-panel
    content: "Add S3 Upload panel to hls_converter.py: Enable checkbox, Course ID (required), Video Name (required), Language dropdown, auto S3 prefix, Delete local checkbox, Test Connection button"
    status: pending
  - id: ui-upload-progress
    content: Add Upload progress bar row with status text showing file count and current file name
    status: pending
  - id: validation
    content: "Add input validation: Course ID (24 hex chars), Video Name (required, max 200), Language (from supported list)"
    status: pending
  - id: worker-upload
    content: "Modify _render_worker: calculate courses/{courseId}/{lang}/ prefix, upload files via uploadUrlExact, create File record via POST /files"
    status: pending
  - id: progress-math
    content: "Adjust progress percentages: HLS 55%, transcription 75%, upload 95%, file record 98%, complete 100%"
    status: pending
  - id: config-persist
    content: Add s3_config.json for non-sensitive settings (last_course_id, last_video_name, language, delete_local)
    status: pending
  - id: error-recovery
    content: Add retry logic (3 attempts, exponential backoff), upload state tracking (.upload_state.json), resume capability
    status: pending
  - id: cancel-upload
    content: Add Cancel Upload button with graceful cancellation and state preservation
    status: pending
isProject: false
---

# S3 Upload Integration (Complete Plan)

## Architecture Overview

```mermaid
sequenceDiagram
    participant Admin as Admin_Panel
    participant App as Python_Encoder
    participant Env as Environment_Vars
    participant Backend as Backend_API
    participant S3 as AWS_S3
    
    Admin->>Admin: 1. Create Course in admin
    Admin->>Admin: 2. Copy Course ID from UI
    App->>Env: 3. Load BACKEND_URL, AUTH_TOKEN
    Admin->>App: 4. Enter Course ID + Video Name
    App->>App: 5. Encode HLS qualities
    App->>App: 6. Transcribe with Whisper
    loop For each file with retry
        App->>Backend: 7. POST /aws/uploadUrlExact
        Backend-->>App: {key, signedUrl, downloadUrl}
        App->>S3: 8. PUT file to S3
        App->>App: Update progress, save state
    end
    App->>Backend: 9. POST /files (create File record)
    Backend-->>App: {_id, name, s3Keys}
    App->>App: 10. Cleanup local files (optional)
    Admin->>Admin: 11. Browse Files, link to Session
```



## Workflow

1. **Admin creates course** in admin panel
2. **Admin copies Course ID** (24-char MongoDB ObjectId)
3. **Admin runs Python encoder** with Course ID + Video Name
4. **Encoder processes** video (HLS + transcripts)
5. **Encoder uploads** to `courses/{courseId}/{language}/`
6. **Encoder creates File record** in backend
7. **Admin links file** to session via file picker modal

## File Changes Summary


| File               | Change                                         |
| ------------------ | ---------------------------------------------- |
| `requirements.txt` | Add `requests>=2.28.0`, `python-dotenv>=1.0.0` |
| `.env.example`     | New - environment variables template           |
| `config.py`        | New - configuration loader class               |
| `s3_uploader.py`   | New - S3 upload manager with retry logic       |
| `hls_converter.py` | Modify - add S3 panel, upload phase, progress  |
| `s3_config.json`   | New - persisted non-sensitive settings         |


---

## 1. Dependencies - [requirements.txt](requirements.txt)

```
requests>=2.28.0
python-dotenv>=1.0.0
```

## 2. Environment Variables - [.env.example](.env.example)

```bash
# Required
BACKEND_URL=https://api.example.com
AUTH_TOKEN=your_jwt_token_here

# Defaults
DEFAULT_LANGUAGE=en

# Endpoints (match backend routes)
PRESIGN_EXACT_ENDPOINT=/api/v1/admin/content/aws/uploadUrlExact
FILE_CREATE_ENDPOINT=/api/v1/admin/content/files
AUTH_VALIDATE_ENDPOINT=/api/v1/admin/auth/me
```

## 3. Configuration - [config.py](config.py)

```python
import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    BACKEND_URL = os.getenv("BACKEND_URL", "")
    AUTH_TOKEN = os.getenv("AUTH_TOKEN", "")
    DEFAULT_LANGUAGE = os.getenv("DEFAULT_LANGUAGE", "en")
    PRESIGN_EXACT_ENDPOINT = os.getenv("PRESIGN_EXACT_ENDPOINT", "/api/v1/admin/content/aws/uploadUrlExact")
    FILE_CREATE_ENDPOINT = os.getenv("FILE_CREATE_ENDPOINT", "/api/v1/admin/content/files")
    AUTH_VALIDATE_ENDPOINT = os.getenv("AUTH_VALIDATE_ENDPOINT", "/api/v1/admin/auth/me")
    SUPPORTED_LANGUAGES = ["en", "es", "fr", "de", "ar", "hi"]
    
    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.BACKEND_URL and cls.AUTH_TOKEN)
    
    @classmethod
    def get_full_url(cls, endpoint: str) -> str:
        return f"{cls.BACKEND_URL.rstrip('/')}{endpoint}"
```

## 4. S3 Upload Manager - [s3_uploader.py](s3_uploader.py)

Key methods:

- `validate_connection()` - Test backend reachability and token validity
- `get_presigned_url_exact(s3_key, content_type)` - POST to uploadUrlExact endpoint
- `upload_file(local_path, signed_url, progress_callback)` - PUT to S3 with progress
- `upload_directory(local_dir, s3_prefix, cancel_check)` - Upload all files with retry
- `create_file_record(name, course_id, language, s3_keys, duration, qualities)` - POST to files endpoint
- `save_upload_state()` / `load_upload_state()` - Resume capability

Content-Type mapping:

```python
CONTENT_TYPES = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".srt": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json",
    ".vtt": "text/vtt",
}
```

Retry logic: 3 attempts with exponential backoff (1s, 3s, 10s).

## 5. UI Changes - [hls_converter.py](hls_converter.py)

### New S3 Upload Panel

```
┌─────────────────────────────────────────────────────┐
│ S3 UPLOAD                                           │
├─────────────────────────────────────────────────────┤
│ [x] Enable S3 Upload                                │
│                                                     │
│ Backend:     ✓ Configured from .env                │
│              (or input fields if not configured)    │
│                                                     │
│ Course ID:   [abc123def456abc123def456     ]       │
│              (Copy from admin panel)                │
│                                                     │
│ Video Name:  [Session 1 - Introduction     ]       │
│              (Display name in file browser)         │
│                                                     │
│ Language:    [en ▾]                                │
│                                                     │
│ S3 Prefix:   courses/abc123.../en/  (auto)         │
│                                                     │
│ [ ] Delete local files after upload                │
│                                                     │
│ [Test Connection]  [Cancel Upload]                  │
└─────────────────────────────────────────────────────┘
```

### Validation Rules

- **Course ID**: Required, 24 hex chars (MongoDB ObjectId format)
- **Video Name**: Required, max 200 chars
- **Language**: Required, from `Config.SUPPORTED_LANGUAGES`

### New Progress Row

```
│ Upload     [████████░░░░░░░░░░░░░░░░] 35%          │
│            Uploading 12/34 (720p/seg_005.ts)       │
```

### Worker Flow Update

```
Phase 1: HLS Encoding (0% -> 55%)
Phase 2: Transcription (55% -> 75%) [if enabled]
Phase 3: S3 Upload (75% -> 95%) [if enabled]
  - Calculate prefix: courses/{courseId}/{language}/
  - Upload each file via uploadUrlExact
  - Save state periodically for resume
Phase 4: Create File Record (95% -> 98%)
  - POST /api/v1/admin/content/files
Phase 5: Complete (98% -> 100%)
  - Delete local files if checkbox enabled
```

---

## S3 Key Structure

```
courses/{courseId}/{language}/
├── master.m3u8
├── 1080p/
│   ├── index.m3u8
│   └── seg_001.ts, seg_002.ts, ...
├── 720p/
│   └── ...
├── 480p/
│   └── ...
├── transcript.srt
├── transcript.txt
└── transcript.json
```

---

## Backend API Endpoints

### 1. Exact-Key Presigned URL

- **Endpoint**: `POST /api/v1/admin/content/aws/uploadUrlExact`
- **Headers**: `Authorization: Bearer {token}`, `Content-Type: application/json`
- **Body**: `{"key": "courses/abc123/en/master.m3u8", "contentType": "application/vnd.apple.mpegurl"}`
- **Response**: `{success: true, code: 200, data: {key, signedUrl, downloadUrl}}`

### 2. Create File Record

- **Endpoint**: `POST /api/v1/admin/content/files`
- **Body**:

```json
{
  "name": "Session 1 - Introduction",
  "courseId": "abc123def456abc123def456",
  "language": "en",
  "type": "hls",
  "s3Keys": {
    "master": "courses/abc123.../en/master.m3u8",
    "qualities": {"1080p": "...", "720p": "...", "480p": "..."},
    "transcript": {"srt": "...", "txt": "...", "json": "..."}
  },
  "duration": 1245,
  "qualities": ["1080p", "720p", "480p"],
  "uploadedBy": "python-encoder"
}
```

### 3. Validate Token (Test Connection)

- **Endpoint**: `GET /api/v1/admin/auth/me`
- **Headers**: `Authorization: Bearer {token}`
- **Response**: 200 = valid, 401 = invalid

---

## Error Handling

- **Retry Logic**: 3 attempts with 1s, 3s, 10s backoff
- **Auth Errors (401/403)**: No retry, show "token expired" message
- **Network Errors**: Retry, save state for resume
- **Partial Failure**: Continue uploading, report failed files at end
- **Resume**: State saved to `.upload_state.json`, prompt to resume on restart

## Config Persistence - [s3_config.json](s3_config.json)

Non-sensitive settings only (credentials stay in `.env`):

```json
{
  "last_course_id": "",
  "last_video_name": "",
  "language": "en",
  "delete_local_after_upload": false
}
```

## Security

- `.env` contains secrets, add to `.gitignore`
- Validate Course ID format before API calls
- HTTPS required for backend URL (except localhost)

---

## Dependencies (Backend Required)

The backend must implement these routes before Python encoder can upload:

1. `POST /api/v1/admin/content/aws/uploadUrlExact` - See [02-backend-implementation.md](docs/file-folder-system/02-backend-implementation.md)
2. `POST /api/v1/admin/content/files` - See [02-backend-implementation.md](docs/file-folder-system/02-backend-implementation.md)

## Related Documentation

- [docs/file-folder-system/01-overview.md](docs/file-folder-system/01-overview.md) - System architecture
- [docs/file-folder-system/02-backend-implementation.md](docs/file-folder-system/02-backend-implementation.md) - Backend routes and models
- [docs/file-folder-system/03-admin-panel-implementation.md](docs/file-folder-system/03-admin-panel-implementation.md) - Admin panel file picker
- [docs/file-folder-system/04-python-encoder-integration.md](docs/file-folder-system/04-python-encoder-integration.md) - Detailed Python code
- [docs/file-folder-system/05-api-specification.md](docs/file-folder-system/05-api-specification.md) - Full API reference

