# File/Folder System - Backend Implementation

## Overview

This document details the backend changes needed to support the file/folder system.

## 1. MongoDB Model

### File: `models/common/content/file_model.js`

```javascript
const mongoose = require('mongoose')

const fileSchema = new mongoose.Schema(
  {
    // Display name (e.g., "Session 1 - Introduction")
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Reference to the course this file belongs to
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },

    // Language code (e.g., "en", "es")
    language: {
      type: String,
      required: true,
      enum: ['en', 'es', 'fr', 'de', 'ar', 'hi'],
      index: true,
    },

    // File type
    type: {
      type: String,
      required: true,
      enum: ['hls', 'transcript'],
      default: 'hls',
    },

    // S3 key paths
    s3Keys: {
      // HLS master playlist
      master: {
        type: String,
        required: function () {
          return this.type === 'hls'
        },
      },
      // Quality-specific playlists
      qualities: {
        type: Map,
        of: String,
        // e.g., { "1080p": "courses/.../1080p/index.m3u8", "720p": "..." }
      },
      // Transcript files
      transcript: {
        srt: String,
        txt: String,
        json: String,
        vtt: String,
      },
    },

    // Video metadata
    duration: {
      type: Number, // Duration in seconds
      default: 0,
    },

    // Available quality levels
    qualities: {
      type: [String],
      default: [],
      // e.g., ["1080p", "720p", "480p"]
    },

    // Thumbnail image S3 key (optional)
    thumbnail: {
      type: String,
    },

    // Upload metadata
    uploadedBy: {
      type: String,
      default: 'python-encoder',
    },

    // Sessions that reference this file (for deletion protection)
    linkedSessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
      },
    ],

    // Soft delete flag
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
)

// Compound index for efficient queries
fileSchema.index({ courseId: 1, language: 1, isDeleted: 1 })
fileSchema.index({ courseId: 1, type: 1, isDeleted: 1 })

// Virtual for S3 prefix
fileSchema.virtual('s3Prefix').get(function () {
  return `courses/${this.courseId}/${this.language}/`
})

// Instance method to check if file can be deleted
fileSchema.methods.canDelete = function () {
  return this.linkedSessions.length === 0
}

// Static method to get files by course and language
fileSchema.statics.findByCourseAndLanguage = function (courseId, language) {
  return this.find({
    courseId,
    language,
    isDeleted: false,
  }).sort({ createdAt: -1 })
}

// Static method to get all files for a course
fileSchema.statics.findByCourse = function (courseId) {
  return this.find({
    courseId,
    isDeleted: false,
  }).sort({ language: 1, createdAt: -1 })
}

const File = mongoose.model('File', fileSchema)

module.exports = { File }
```

## 2. API Routes

### File: `routes/v1/admin/content/route_admin_files.js`

```javascript
const express = require('express')
const router = express.Router()
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')
const { File } = require('../../../../models/common/content/file_model')
const { Course } = require('../../../../models/common/content/course_model')
const { Session } = require('../../../../models/common/content/session_model')
const { deleteAwsObject, deleteHLSFiles } = require('../../../../services/aws/utils')

/**
 * GET /api/v1/admin/content/files
 * List files for a course (optionally filtered by language)
 */
router.get(
  '/',
  catchAsyncError(async (req, res, next) => {
    const { courseId, language, type } = req.query

    if (!courseId) {
      return next(new ErrorHandler('courseId is required', HTTP.BAD_REQUEST))
    }

    // Verify course exists
    const course = await Course.findById(courseId)
    if (!course) {
      return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
    }

    // Build query
    const query = { courseId, isDeleted: false }
    if (language) query.language = language
    if (type) query.type = type

    const files = await File.find(query).sort({ createdAt: -1 })

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: {
        files,
        s3Prefix: `courses/${courseId}/`,
        availableLanguages: course.availableLanguages || ['en'],
      },
      message: 'Files retrieved successfully',
    })
  })
)

/**
 * GET /api/v1/admin/content/files/:id
 * Get a single file by ID
 */
router.get(
  '/:id',
  catchAsyncError(async (req, res, next) => {
    const file = await File.findById(req.params.id)

    if (!file || file.isDeleted) {
      return next(new ErrorHandler('File not found', HTTP.NOT_FOUND))
    }

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: file,
      message: 'File retrieved successfully',
    })
  })
)

/**
 * POST /api/v1/admin/content/files
 * Create a new file record (called by Python encoder after upload)
 */
router.post(
  '/',
  catchAsyncError(async (req, res, next) => {
    const {
      name,
      courseId,
      language,
      type,
      s3Keys,
      duration,
      qualities,
      thumbnail,
      uploadedBy,
    } = req.body

    // Validate required fields
    if (!name || !courseId || !language) {
      return next(
        new ErrorHandler('name, courseId, and language are required', HTTP.BAD_REQUEST)
      )
    }

    // Verify course exists
    const course = await Course.findById(courseId)
    if (!course) {
      return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
    }

    // Create file record
    const file = new File({
      name,
      courseId,
      language,
      type: type || 'hls',
      s3Keys,
      duration: duration || 0,
      qualities: qualities || [],
      thumbnail,
      uploadedBy: uploadedBy || 'python-encoder',
    })

    await file.save()

    return sendResponse({
      res,
      status: true,
      code: HTTP.CREATED,
      data: file,
      message: 'File created successfully',
    })
  })
)

/**
 * PUT /api/v1/admin/content/files/:id
 * Update a file record
 */
router.put(
  '/:id',
  catchAsyncError(async (req, res, next) => {
    const { name, duration, qualities, thumbnail } = req.body

    const file = await File.findById(req.params.id)
    if (!file || file.isDeleted) {
      return next(new ErrorHandler('File not found', HTTP.NOT_FOUND))
    }

    // Update allowed fields
    if (name) file.name = name
    if (duration !== undefined) file.duration = duration
    if (qualities) file.qualities = qualities
    if (thumbnail !== undefined) file.thumbnail = thumbnail

    await file.save()

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: file,
      message: 'File updated successfully',
    })
  })
)

/**
 * DELETE /api/v1/admin/content/files/:id
 * Delete a file (prevents if linked to sessions)
 */
router.delete(
  '/:id',
  catchAsyncError(async (req, res, next) => {
    const { force } = req.query // ?force=true to skip link check (admin override)

    const file = await File.findById(req.params.id)
    if (!file || file.isDeleted) {
      return next(new ErrorHandler('File not found', HTTP.NOT_FOUND))
    }

    // Check if file is linked to any sessions
    if (file.linkedSessions.length > 0 && force !== 'true') {
      return next(
        new ErrorHandler(
          `Cannot delete: File is linked to ${file.linkedSessions.length} session(s). Use ?force=true to override.`,
          HTTP.CONFLICT
        )
      )
    }

    // Delete S3 files
    try {
      if (file.type === 'hls' && file.s3Keys?.master) {
        // Delete all HLS files under the prefix
        const prefix = file.s3Keys.master.replace('/master.m3u8', '')
        await deleteHLSFiles(prefix)
      }

      // Delete transcript files
      if (file.s3Keys?.transcript) {
        const transcriptKeys = Object.values(file.s3Keys.transcript).filter(Boolean)
        await Promise.all(transcriptKeys.map((key) => deleteAwsObject(key)))
      }

      // Delete thumbnail
      if (file.thumbnail) {
        await deleteAwsObject(file.thumbnail)
      }
    } catch (error) {
      console.error('Error deleting S3 files:', error)
      // Continue with DB deletion even if S3 fails
    }

    // Hard delete from database
    await File.findByIdAndDelete(req.params.id)

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: null,
      message: 'File deleted successfully',
    })
  })
)

/**
 * POST /api/v1/admin/content/files/:id/link
 * Link a file to a session (called when admin selects file)
 */
router.post(
  '/:id/link',
  catchAsyncError(async (req, res, next) => {
    const { sessionId } = req.body

    if (!sessionId) {
      return next(new ErrorHandler('sessionId is required', HTTP.BAD_REQUEST))
    }

    const file = await File.findById(req.params.id)
    if (!file || file.isDeleted) {
      return next(new ErrorHandler('File not found', HTTP.NOT_FOUND))
    }

    const session = await Session.findById(sessionId)
    if (!session) {
      return next(new ErrorHandler('Session not found', HTTP.NOT_FOUND))
    }

    // Add session to linkedSessions if not already present
    if (!file.linkedSessions.includes(sessionId)) {
      file.linkedSessions.push(sessionId)
      await file.save()
    }

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: file,
      message: 'File linked to session',
    })
  })
)

/**
 * POST /api/v1/admin/content/files/:id/unlink
 * Unlink a file from a session
 */
router.post(
  '/:id/unlink',
  catchAsyncError(async (req, res, next) => {
    const { sessionId } = req.body

    if (!sessionId) {
      return next(new ErrorHandler('sessionId is required', HTTP.BAD_REQUEST))
    }

    const file = await File.findById(req.params.id)
    if (!file || file.isDeleted) {
      return next(new ErrorHandler('File not found', HTTP.NOT_FOUND))
    }

    // Remove session from linkedSessions
    file.linkedSessions = file.linkedSessions.filter(
      (id) => id.toString() !== sessionId
    )
    await file.save()

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: file,
      message: 'File unlinked from session',
    })
  })
)

/**
 * GET /api/v1/admin/content/files/folder-path/:courseId
 * Get the S3 folder path for a course (used by Python encoder)
 */
router.get(
  '/folder-path/:courseId',
  catchAsyncError(async (req, res, next) => {
    const { courseId } = req.params
    const { language } = req.query

    const course = await Course.findById(courseId)
    if (!course) {
      return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
    }

    const lang = language || 'en'
    const folderPath = `courses/${courseId}/${lang}`

    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: {
        courseId,
        courseName: course.name,
        language: lang,
        folderPath,
        s3Prefix: `courses/${courseId}/${lang}/`,
      },
      message: 'Folder path retrieved successfully',
    })
  })
)

module.exports = router
```

## 3. Register Routes

### File: `routes/v1/admin/route_admin_content.js`

Add the files route:

```javascript
// Add this import
const files = require('./content/route_admin_files')

// Add this route registration (after other routes)
router.use('/files', files)
```

## 4. Update Session Update Logic

When a file is selected for a session, the session's `video`, `hls`, and `transcribe` fields should be updated. Add a helper function:

### File: `services/content/sessionService.js` (or add to existing)

```javascript
const { File } = require('../../models/common/content/file_model')
const { Session } = require('../../models/common/content/session_model')

/**
 * Link a file to a session (copy S3 keys to session fields)
 */
async function linkFileToSession(fileId, sessionId, language) {
  const file = await File.findById(fileId)
  if (!file) throw new Error('File not found')

  const session = await Session.findById(sessionId)
  if (!session) throw new Error('Session not found')

  const lang = language || file.language

  // Update session fields based on file type
  if (file.type === 'hls') {
    // Copy HLS data to session
    if (!session.hls) session.hls = new Map()
    session.hls.set(lang, {
      url: file.s3Keys.master,
      status: 'COMPLETE',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // Copy primary video key (use master playlist)
    if (!session.video) session.video = new Map()
    session.video.set(lang, file.s3Keys.master)

    // Copy duration
    if (!session.duration) session.duration = new Map()
    session.duration.set(lang, file.duration || 0)
  }

  // Copy transcript if available
  if (file.s3Keys?.transcript?.json) {
    if (!session.transcribe) session.transcribe = new Map()
    session.transcribe.set(lang, file.s3Keys.transcript.json)
  }

  await session.save()

  // Track the link in File document
  if (!file.linkedSessions.includes(sessionId)) {
    file.linkedSessions.push(sessionId)
    await file.save()
  }

  return session
}

module.exports = {
  linkFileToSession,
}
```

## 5. Exact-Key Presigned URL Endpoint

For the Python encoder to upload HLS files with exact keys (no timestamp), add this endpoint:

### File: `routes/v1/admin/content/route_admin_aws.js`

Add this new route:

```javascript
/**
 * POST /api/v1/admin/content/aws/uploadUrlExact
 * Generate presigned URL for an exact S3 key (no timestamp/sanitization)
 * Required for HLS uploads where filenames must match playlist references
 */
router.post(
  '/uploadUrlExact',
  catchAsyncError(async (req, res, next) => {
    const { key, contentType } = req.body

    if (!key) {
      return next(new ErrorHandler('key is required', HTTP.BAD_REQUEST))
    }

    // Validate key format (basic security check)
    if (key.includes('..') || key.startsWith('/')) {
      return next(new ErrorHandler('Invalid key format', HTTP.BAD_REQUEST))
    }

    const uploadRes = await generatePreSignedUploadUrlExact(key, contentType)
    
    return sendResponse({
      res,
      status: true,
      code: HTTP.OK,
      data: uploadRes,
      message: 'Upload URL generated successfully',
    })
  })
)
```

### File: `services/aws/index.js`

Add this new function:

```javascript
/**
 * Generate presigned URL for an exact S3 key (no modification)
 */
async function generatePreSignedUploadUrlExact(key, contentType) {
  const cleanedKey = key.replace(/^\/+/, '') // Remove leading slashes only

  const params = {
    Bucket: S3_BUCKET,
    Key: cleanedKey,
    ACL: 'public-read',
  }

  // Add content type if provided
  if (contentType) {
    params.ContentType = contentType
  }

  const signedUrl = await getSignedUrl(bucket, new PutObjectCommand(params), {
    expiresIn: S3_CONSTANTS.URL_EXPIRATION.LONG,
  })

  return {
    key: cleanedKey,
    signedUrl,
    downloadUrl: await generateObjectUrl(cleanedKey),
  }
}

// Export the new function
module.exports = {
  // ... existing exports
  generatePreSignedUploadUrlExact,
}
```

## 6. Database Indexes

Run this in MongoDB shell or via migration:

```javascript
// Create indexes for efficient queries
db.files.createIndex({ courseId: 1, language: 1, isDeleted: 1 })
db.files.createIndex({ courseId: 1, type: 1, isDeleted: 1 })
db.files.createIndex({ courseId: 1, createdAt: -1 })
```

## File Structure Summary

```
backend/
├── models/
│   └── common/
│       └── content/
│           └── file_model.js          # NEW: File model
├── routes/
│   └── v1/
│       └── admin/
│           ├── route_admin_content.js  # MODIFY: Add files route
│           └── content/
│               ├── route_admin_files.js # NEW: File CRUD routes
│               └── route_admin_aws.js   # MODIFY: Add uploadUrlExact
├── services/
│   ├── aws/
│   │   └── index.js                    # MODIFY: Add generatePreSignedUploadUrlExact
│   └── content/
│       └── sessionService.js           # NEW/MODIFY: Add linkFileToSession
```

## Testing Checklist

- [ ] File model created and indexes added
- [ ] `GET /files?courseId=xxx` returns files for a course
- [ ] `GET /files/:id` returns a single file
- [ ] `POST /files` creates a new file record
- [ ] `PUT /files/:id` updates file metadata
- [ ] `DELETE /files/:id` fails if file is linked to sessions
- [ ] `DELETE /files/:id?force=true` deletes even if linked
- [ ] `POST /files/:id/link` tracks session linkage
- [ ] `POST /files/:id/unlink` removes session linkage
- [ ] `GET /files/folder-path/:courseId` returns S3 prefix
- [ ] `POST /aws/uploadUrlExact` returns presigned URL with exact key
