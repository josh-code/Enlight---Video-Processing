# File/Folder System - Python Encoder Integration

## Overview

This document describes how the Python HLS encoder integrates with the file/folder system.

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PYTHON ENCODER WORKFLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. ADMIN PROVIDES INPUTS                                                   │
│     - Course ID (from admin panel)                                          │
│     - Language (en, es, etc.)                                               │
│     - Video file to encode                                                  │
│     - Video name (for display)                                              │
│                                                                             │
│  2. ENCODER CALCULATES S3 PREFIX                                            │
│     - s3_prefix = f"courses/{course_id}/{language}/"                        │
│                                                                             │
│  3. ENCODER PROCESSES VIDEO                                                 │
│     - Creates HLS streams (1080p, 720p, 480p)                               │
│     - Creates transcripts (SRT, TXT, JSON)                                  │
│                                                                             │
│  4. ENCODER UPLOADS TO S3                                                   │
│     - For each file:                                                        │
│       a. Call POST /aws/uploadUrlExact with exact key                       │
│       b. Upload to S3 using presigned URL                                   │
│                                                                             │
│  5. ENCODER CREATES FILE RECORD                                             │
│     - Call POST /files with all metadata                                    │
│     - Backend creates File document in MongoDB                              │
│                                                                             │
│  6. COMPLETE                                                                │
│     - File is now visible in admin panel                                    │
│     - Admin can link it to sessions                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables (.env)

```bash
# Backend API Configuration
BACKEND_URL=https://api.example.com
AUTH_TOKEN=your_admin_jwt_token

# Default Settings
DEFAULT_LANGUAGE=en

# API Endpoints
PRESIGN_ENDPOINT=/api/v1/admin/content/aws/uploadUrlExact
FILE_CREATE_ENDPOINT=/api/v1/admin/content/files
```

## Code Changes

### 1. Add Course ID and Name Fields to UI

In `hls_converter.py`, add new UI fields in the S3 Upload panel:

```python
# Add to __init__ or _build_ui
self.course_id_var = tk.StringVar()
self.video_name_var = tk.StringVar()

# In S3 panel UI:
# Course ID field (required for file system)
course_id_label = ttk.Label(s3_panel, text="Course ID:")
course_id_entry = ttk.Entry(s3_panel, textvariable=self.course_id_var, width=30)

# Video Name field (display name)
video_name_label = ttk.Label(s3_panel, text="Video Name:")
video_name_entry = ttk.Entry(s3_panel, textvariable=self.video_name_var, width=30)
```

### 2. Calculate S3 Prefix from Course ID

```python
def _get_s3_prefix(self) -> str:
    """Calculate S3 prefix from course ID and language."""
    course_id = self.course_id_var.get().strip()
    language = self.language_var.get() or 'en'
    
    if not course_id:
        raise ValueError("Course ID is required")
    
    return f"courses/{course_id}/{language}"
```

### 3. Upload Files with Exact Keys

Update `s3_uploader.py` to use exact-key presigning:

```python
def get_presigned_url_exact(self, s3_key: str, content_type: str = None) -> Tuple[bool, str, str]:
    """Request presigned URL for exact S3 key (no timestamp/sanitization).
    
    Calls: POST {backend_url}/api/v1/admin/content/aws/uploadUrlExact
    Body: {"key": s3_key, "contentType": content_type}
    
    Returns: (success, signed_url, error_msg)
    """
    try:
        url = f"{self.backend_url}{Config.PRESIGN_ENDPOINT}"
        
        payload = {"key": s3_key}
        if content_type:
            payload["contentType"] = content_type
        
        response = requests.post(
            url,
            json=payload,
            headers=self._get_headers(),
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("data"):
                return True, data["data"]["signedUrl"], ""
            return False, "", data.get("message", "Unknown error")
        elif response.status_code == 401:
            return False, "", "Authentication failed - check AUTH_TOKEN"
        else:
            return False, "", f"Backend returned {response.status_code}"
            
    except requests.exceptions.ConnectionError:
        return False, "", "Cannot connect to backend"
    except Exception as e:
        return False, "", str(e)
```

### 4. Create File Record After Upload

Add a method to create the file record:

```python
def create_file_record(self, 
                       name: str,
                       course_id: str,
                       language: str,
                       s3_keys: dict,
                       duration: int = 0,
                       qualities: list = None) -> Tuple[bool, dict, str]:
    """Create a file record in the backend.
    
    Calls: POST {backend_url}/api/v1/admin/content/files
    
    Args:
        name: Display name for the file
        course_id: MongoDB ObjectId of the course
        language: Language code (e.g., "en")
        s3_keys: Dict with S3 key paths
        duration: Video duration in seconds
        qualities: List of quality levels (e.g., ["1080p", "720p", "480p"])
    
    Returns: (success, file_data, error_msg)
    """
    try:
        url = f"{self.backend_url}{Config.FILE_CREATE_ENDPOINT}"
        
        payload = {
            "name": name,
            "courseId": course_id,
            "language": language,
            "type": "hls",
            "s3Keys": s3_keys,
            "duration": duration,
            "qualities": qualities or [],
            "uploadedBy": "python-encoder"
        }
        
        response = requests.post(
            url,
            json=payload,
            headers=self._get_headers(),
            timeout=30
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            if data.get("success"):
                return True, data.get("data", {}), ""
            return False, {}, data.get("message", "Unknown error")
        elif response.status_code == 401:
            return False, {}, "Authentication failed - check AUTH_TOKEN"
        else:
            return False, {}, f"Backend returned {response.status_code}"
            
    except requests.exceptions.ConnectionError:
        return False, {}, "Cannot connect to backend"
    except Exception as e:
        return False, {}, str(e)
```

### 5. Integration in Worker Flow

Update `_render_worker` to:

1. Get the S3 prefix from course ID
2. Upload files with exact keys
3. Create file record after successful upload

```python
def _render_worker(self):
    # ... existing encoding and transcription code ...
    
    # After all encoding and transcription is complete:
    if self.s3_upload_enabled.get():
        try:
            # Get course info
            course_id = self.course_id_var.get().strip()
            language = self.language_var.get() or 'en'
            video_name = self.video_name_var.get().strip() or os.path.basename(self.file_path)
            
            if not course_id:
                raise ValueError("Course ID is required for S3 upload")
            
            # Calculate S3 prefix
            s3_prefix = f"courses/{course_id}/{language}/"
            
            # Collect all files to upload
            files_to_upload = self._collect_output_files(output_dir, s3_prefix)
            
            # Upload each file
            uploaded_keys = {}
            for local_path, s3_key, content_type in files_to_upload:
                success, signed_url, error = self.s3_manager.get_presigned_url_exact(
                    s3_key, content_type
                )
                if not success:
                    raise Exception(f"Failed to get presigned URL: {error}")
                
                success, error = self.s3_manager.upload_file(local_path, signed_url)
                if not success:
                    raise Exception(f"Failed to upload {s3_key}: {error}")
                
                # Track uploaded keys
                self._track_uploaded_key(uploaded_keys, local_path, s3_key)
            
            # Build s3Keys structure for file record
            s3_keys = self._build_s3_keys_structure(uploaded_keys, s3_prefix)
            
            # Create file record
            success, file_data, error = self.s3_manager.create_file_record(
                name=video_name,
                course_id=course_id,
                language=language,
                s3_keys=s3_keys,
                duration=self.video_duration or 0,
                qualities=self.encoded_qualities  # e.g., ["1080p", "720p", "480p"]
            )
            
            if not success:
                raise Exception(f"Failed to create file record: {error}")
            
            # Update status
            self.root.after(0, lambda: self._set_status(
                f"Upload complete! File ID: {file_data.get('_id', 'unknown')}"
            ))
            
        except Exception as e:
            self.root.after(0, lambda: self._set_status(f"Upload failed: {e}"))
```

### 6. Helper Methods

```python
def _collect_output_files(self, output_dir: str, s3_prefix: str) -> list:
    """Collect all files to upload with their S3 keys and content types.
    
    Returns: List of (local_path, s3_key, content_type) tuples
    """
    files = []
    
    # HLS files
    for root, dirs, filenames in os.walk(output_dir):
        for filename in filenames:
            local_path = os.path.join(root, filename)
            relative_path = os.path.relpath(local_path, output_dir)
            s3_key = f"{s3_prefix}{relative_path}".replace("\\", "/")
            content_type = CONTENT_TYPES.get(
                os.path.splitext(filename)[1].lower(),
                "application/octet-stream"
            )
            files.append((local_path, s3_key, content_type))
    
    return files

def _build_s3_keys_structure(self, uploaded_keys: dict, s3_prefix: str) -> dict:
    """Build the s3Keys structure expected by the backend.
    
    Returns:
        {
            "master": "courses/xxx/en/master.m3u8",
            "qualities": {
                "1080p": "courses/xxx/en/1080p/index.m3u8",
                "720p": "courses/xxx/en/720p/index.m3u8",
                "480p": "courses/xxx/en/480p/index.m3u8"
            },
            "transcript": {
                "srt": "courses/xxx/en/transcript.srt",
                "txt": "courses/xxx/en/transcript.txt",
                "json": "courses/xxx/en/transcript.json"
            }
        }
    """
    s3_keys = {
        "master": f"{s3_prefix}master.m3u8",
        "qualities": {},
        "transcript": {}
    }
    
    for quality in self.encoded_qualities:
        s3_keys["qualities"][quality] = f"{s3_prefix}{quality}/index.m3u8"
    
    # Check for transcript files
    transcript_extensions = {
        ".srt": "srt",
        ".txt": "txt", 
        ".json": "json",
        ".vtt": "vtt"
    }
    
    for local_path, s3_key in uploaded_keys.items():
        ext = os.path.splitext(local_path)[1].lower()
        if ext in transcript_extensions:
            key_name = transcript_extensions[ext]
            s3_keys["transcript"][key_name] = s3_key
    
    return s3_keys
```

## UI Updates

### S3 Upload Panel

```
┌─────────────────────────────────────────────────────┐
│ S3 UPLOAD                                           │
├─────────────────────────────────────────────────────┤
│ [x] Enable S3 Upload                                │
│                                                     │
│ Backend:     ✓ Configured from .env                │
│                                                     │
│ Course ID:   [abc123def456abc123def456     ]       │
│              (Copy from admin panel)                │
│                                                     │
│ Video Name:  [Session 1 - Introduction     ]       │
│              (Display name in file browser)         │
│                                                     │
│ Language:    [en ▾]                                │
│                                                     │
│ S3 Prefix:   courses/abc123def456.../en/           │
│              (Auto-calculated)                      │
│                                                     │
│ [ ] Delete local files after upload                │
│                                                     │
│ [Test Connection]  [Cancel Upload]                  │
│                                                     │
│ Note: Get Course ID from admin panel after         │
│ creating the course.                                │
└─────────────────────────────────────────────────────┘
```

## Validation

Before starting upload, validate:

```python
def _validate_file_system_inputs(self) -> Tuple[bool, str]:
    """Validate inputs for file system upload."""
    errors = []
    
    # Course ID validation (MongoDB ObjectId format)
    course_id = self.course_id_var.get().strip()
    if not course_id:
        errors.append("Course ID is required")
    elif not re.match(r'^[a-fA-F0-9]{24}$', course_id):
        errors.append("Course ID must be a valid MongoDB ObjectId (24 hex chars)")
    
    # Video name validation
    video_name = self.video_name_var.get().strip()
    if not video_name:
        errors.append("Video Name is required")
    elif len(video_name) > 200:
        errors.append("Video Name must be less than 200 characters")
    
    # Language validation
    language = self.language_var.get()
    if language not in Config.SUPPORTED_LANGUAGES:
        errors.append(f"Language must be one of: {', '.join(Config.SUPPORTED_LANGUAGES)}")
    
    if errors:
        return False, "\n".join(errors)
    return True, ""
```

## S3 Key Structure

Files are uploaded with this structure:

```
courses/
└── {courseId}/
    └── {language}/
        ├── master.m3u8              # HLS master playlist
        ├── 1080p/
        │   ├── index.m3u8           # Quality playlist
        │   ├── seg_001.ts           # Segments
        │   ├── seg_002.ts
        │   └── ...
        ├── 720p/
        │   ├── index.m3u8
        │   └── ...
        ├── 480p/
        │   ├── index.m3u8
        │   └── ...
        ├── transcript.srt           # SRT transcript
        ├── transcript.txt           # Plain text transcript
        └── transcript.json          # JSON transcript
```

## Error Handling

```python
# Handle common errors
try:
    # Upload flow
except requests.exceptions.ConnectionError:
    self._show_error("Cannot connect to backend. Check BACKEND_URL in .env")
except requests.exceptions.Timeout:
    self._show_error("Request timed out. Try again.")
except Exception as e:
    if "401" in str(e):
        self._show_error("Authentication failed. Get a fresh token from admin panel.")
    elif "404" in str(e):
        self._show_error("Course not found. Verify the Course ID.")
    else:
        self._show_error(f"Upload failed: {e}")
```

## Testing Checklist

- [ ] Course ID field accepts valid MongoDB ObjectId
- [ ] Video Name field is required
- [ ] S3 prefix is calculated correctly
- [ ] Presigned URL (exact key) works for each file type
- [ ] All HLS files upload successfully
- [ ] All transcript files upload successfully
- [ ] File record is created in backend
- [ ] File appears in admin panel after upload
- [ ] Progress bar updates during upload
- [ ] Error messages are clear and actionable
