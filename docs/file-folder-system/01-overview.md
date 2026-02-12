# File/Folder System - Overview

## Purpose

Add a file management system to the admin panel that allows admins to:
1. Browse video files uploaded by the Python encoder
2. Select existing videos when creating/editing course sessions
3. Organize files by course and language

## Key Features

- **Course-based folder structure**: Files auto-organized as `courses/{courseId}/{language}/`
- **Videos only**: Manages HLS streams and transcript files
- **File picker modal**: Browse and select files when editing sessions
- **Python encoder integration**: Files are uploaded exclusively from the Python HLS encoder

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ADMIN WORKFLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. ADMIN CREATES COURSE                                                    │
│     └─> Course created in admin panel                                       │
│     └─> System generates folder path: courses/{courseId}/{lang}/            │
│                                                                             │
│  2. PYTHON ENCODER UPLOADS                                                  │
│     └─> Admin uses Python encoder with the folder path                      │
│     └─> Encoder uploads HLS + transcripts to S3                             │
│     └─> Encoder calls backend to create File records                        │
│                                                                             │
│  3. ADMIN LINKS FILES TO SESSIONS                                           │
│     └─> Admin opens session editor                                          │
│     └─> Clicks "Select Video" button                                        │
│     └─> File picker modal shows available files for the course              │
│     └─> Admin selects a file                                                │
│     └─> S3 keys are copied to the session's video/hls fields                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Admin Panel    │      │    Backend      │      │     AWS S3      │
│  (React)        │      │    (Node.js)    │      │                 │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│                 │      │                 │      │                 │
│ File Picker     │─────>│ File Routes     │      │ courses/        │
│ Modal           │      │ /api/v1/admin/  │      │   {courseId}/   │
│                 │      │   content/files │      │     {lang}/     │
│ Session Editor  │      │                 │      │       *.m3u8    │
│                 │      │ File Model      │      │       *.ts      │
│ Folder Browser  │      │ (MongoDB)       │      │       *.srt     │
│ (optional)      │      │                 │      │       *.json    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                        │                        ▲
        │                        │                        │
        │                        ▼                        │
        │                ┌─────────────────┐              │
        │                │ Python Encoder  │──────────────┘
        │                │ (HLS Converter) │  Uploads files
        │                └─────────────────┘
        │                        │
        └────────────────────────┘
              API calls
```

## Data Flow

1. **Course Creation** → Backend creates Course document with `_id`
2. **Admin gets folder path** → `courses/{courseId}/en/` shown in UI
3. **Python encoder** → Uploads HLS to S3, calls `POST /api/v1/admin/content/files` to create File record
4. **File Picker** → `GET /api/v1/admin/content/files?courseId=xxx` returns available files
5. **File Selection** → S3 keys copied to Session document's `video`, `hls`, `transcribe` fields

## S3 Key Structure

```
courses/
└── {courseId}/
    └── {language}/
        ├── master.m3u8              # HLS master playlist
        ├── 1080p/
        │   ├── index.m3u8
        │   └── seg_001.ts, seg_002.ts, ...
        ├── 720p/
        │   ├── index.m3u8
        │   └── seg_001.ts, seg_002.ts, ...
        ├── 480p/
        │   ├── index.m3u8
        │   └── seg_001.ts, seg_002.ts, ...
        ├── transcript.srt
        ├── transcript.txt
        └── transcript.json
```

## File Metadata Stored

| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Display name (e.g., "Session 1 - Introduction") |
| `courseId` | ObjectId | Reference to Course |
| `language` | String | Language code (e.g., "en", "es") |
| `type` | String | File type: "hls", "transcript" |
| `s3Keys` | Object | S3 key paths (see below) |
| `duration` | Number | Video duration in seconds |
| `qualities` | [String] | Available qualities ["1080p", "720p", "480p"] |
| `thumbnail` | String | S3 key for thumbnail image (optional) |
| `uploadedAt` | Date | When file was uploaded |
| `uploadedBy` | String | "python-encoder" |

### s3Keys Structure

```javascript
{
  master: "courses/abc123/en/master.m3u8",
  qualities: {
    "1080p": "courses/abc123/en/1080p/index.m3u8",
    "720p": "courses/abc123/en/720p/index.m3u8",
    "480p": "courses/abc123/en/480p/index.m3u8"
  },
  transcript: {
    srt: "courses/abc123/en/transcript.srt",
    txt: "courses/abc123/en/transcript.txt",
    json: "courses/abc123/en/transcript.json"
  }
}
```

## Documents in This Series

1. **01-overview.md** - This document
2. **02-backend-implementation.md** - MongoDB models, API routes, services
3. **03-admin-panel-implementation.md** - React components, file picker, integration
4. **04-python-encoder-integration.md** - How Python encoder creates File records
5. **05-api-specification.md** - Detailed API endpoint documentation

## Out of Scope

- Nested folder structures (folders containing folders)
- Direct uploads from admin panel (all uploads via Python encoder)
- Migration of existing course videos
- File status tracking (processing/ready) - files only appear after fully processed
- Image and document management (videos only)
