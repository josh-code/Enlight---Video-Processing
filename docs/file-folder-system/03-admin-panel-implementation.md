# File/Folder System - Admin Panel Implementation

## Overview

This document details the React admin panel changes needed to support the file/folder system.

## 1. New API Service

### File: `src/services/content/fileService.js`

```javascript
import http from '../httpServices'

const apiEndpoint = '/v1/admin/content/files'

/**
 * Get all files for a course
 * @param {string} courseId - Course ID
 * @param {string} [language] - Optional language filter
 * @param {string} [type] - Optional type filter ('hls' | 'transcript')
 */
export async function getFilesByCourse(courseId, language, type) {
  const params = new URLSearchParams({ courseId })
  if (language) params.append('language', language)
  if (type) params.append('type', type)
  
  const res = await http.get(`${apiEndpoint}?${params.toString()}`)
  return res.data
}

/**
 * Get a single file by ID
 */
export async function getFileById(fileId) {
  const res = await http.get(`${apiEndpoint}/${fileId}`)
  return res.data
}

/**
 * Create a new file record (used by Python encoder)
 */
export async function createFile(data) {
  const res = await http.post(apiEndpoint, data)
  return res.data
}

/**
 * Update file metadata
 */
export async function updateFile(fileId, data) {
  const res = await http.put(`${apiEndpoint}/${fileId}`, data)
  return res.data
}

/**
 * Delete a file
 * @param {string} fileId - File ID
 * @param {boolean} [force=false] - Force delete even if linked
 */
export async function deleteFile(fileId, force = false) {
  const url = force ? `${apiEndpoint}/${fileId}?force=true` : `${apiEndpoint}/${fileId}`
  const res = await http.delete(url)
  return res.data
}

/**
 * Link a file to a session
 */
export async function linkFileToSession(fileId, sessionId) {
  const res = await http.post(`${apiEndpoint}/${fileId}/link`, { sessionId })
  return res.data
}

/**
 * Unlink a file from a session
 */
export async function unlinkFileFromSession(fileId, sessionId) {
  const res = await http.post(`${apiEndpoint}/${fileId}/unlink`, { sessionId })
  return res.data
}

/**
 * Get folder path for a course (for Python encoder)
 */
export async function getFolderPath(courseId, language = 'en') {
  const res = await http.get(`${apiEndpoint}/folder-path/${courseId}?language=${language}`)
  return res.data
}

export default {
  getFilesByCourse,
  getFileById,
  createFile,
  updateFile,
  deleteFile,
  linkFileToSession,
  unlinkFileFromSession,
  getFolderPath,
}
```

## 2. File Picker Modal Component

### File: `src/components/modals/FilePicker/index.jsx`

```jsx
import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Video, FileText, Clock, Check } from 'lucide-react'
import { getFilesByCourse } from '@/services/content/fileService'
import { formatDuration } from '@/lib/utils'

/**
 * File Picker Modal
 * Allows admins to browse and select files from the course's folder
 */
export default function FilePicker({
  open,
  onOpenChange,
  courseId,
  onSelect,
  selectedFileId,
  availableLanguages = ['en'],
  defaultLanguage = 'en',
}) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [language, setLanguage] = useState(defaultLanguage)
  const [s3Prefix, setS3Prefix] = useState('')

  // Fetch files when modal opens or language changes
  useEffect(() => {
    if (open && courseId) {
      fetchFiles()
    }
  }, [open, courseId, language])

  const fetchFiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getFilesByCourse(courseId, language, 'hls')
      setFiles(response.data.files || [])
      setS3Prefix(response.data.s3Prefix || '')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load files')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (file) => {
    onSelect(file)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Video File</DialogTitle>
          <DialogDescription>
            Choose a video from the course folder to link to this session
          </DialogDescription>
        </DialogHeader>

        {/* Language Filter */}
        <div className="flex items-center gap-4 py-2">
          <span className="text-sm text-muted-foreground">Language:</span>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableLanguages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {s3Prefix && (
            <span className="text-xs text-muted-foreground ml-auto">
              Folder: {s3Prefix}
            </span>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading files...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-destructive">
              {error}
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Video className="h-12 w-12 mb-2 opacity-50" />
              <p>No video files found</p>
              <p className="text-xs mt-1">
                Upload videos using the Python encoder
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {files.map((file) => (
                <FileItem
                  key={file._id}
                  file={file}
                  isSelected={selectedFileId === file._id}
                  onSelect={() => handleSelect(file)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * File Item Component
 */
function FileItem({ file, isSelected, onSelect }) {
  return (
    <div
      onClick={onSelect}
      className={`
        flex items-center gap-4 p-4 cursor-pointer transition-colors
        hover:bg-accent
        ${isSelected ? 'bg-accent border-l-2 border-primary' : ''}
      `}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {file.type === 'hls' ? (
          <Video className="h-10 w-10 text-blue-500" />
        ) : (
          <FileText className="h-10 w-10 text-green-500" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{file.name}</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {file.duration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(file.duration)}
            </span>
          )}
          {file.qualities?.length > 0 && (
            <span>{file.qualities.join(', ')}</span>
          )}
          <span className="text-xs">
            {new Date(file.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="flex-shrink-0">
          <Check className="h-5 w-5 text-primary" />
        </div>
      )}
    </div>
  )
}
```

## 3. Folder Path Display Component

Shows the S3 folder path for admins to use in Python encoder.

### File: `src/components/misc/FolderPathDisplay.jsx`

```jsx
import React, { useState } from 'react'
import { Copy, Check, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

/**
 * Display and copy the S3 folder path for a course
 */
export default function FolderPathDisplay({ courseId, language = 'en' }) {
  const [copied, setCopied] = useState(false)
  
  const folderPath = `courses/${courseId}/${language}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(folderPath)
      setCopied(true)
      toast.success('Folder path copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error('Failed to copy')
    }
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
      <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <code className="text-sm flex-1 truncate">{folderPath}</code>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="flex-shrink-0"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
```

## 4. Integration with Session Editor

Update the session form to include a "Select Video" button.

### File: `src/components/modals/AddSession/stages/CourseContent.jsx` (MODIFY)

Add import and state:

```jsx
import FilePicker from '@/components/modals/FilePicker'
import { linkFileToSession } from '@/services/content/fileService'

// Add to component state
const [filePickerOpen, setFilePickerOpen] = useState(false)
const [selectedFile, setSelectedFile] = useState(null)
```

Add handler:

```jsx
const handleFileSelect = async (file) => {
  setSelectedFile(file)
  
  // If session already exists, link the file
  if (sessionId) {
    try {
      await linkFileToSession(file._id, sessionId)
      toast.success('Video linked successfully')
    } catch (err) {
      toast.error('Failed to link video')
    }
  }
  
  // Update form data with S3 keys
  const lang = file.language || 'en'
  setValue(`video.${lang}`, file.s3Keys?.master || '')
  setValue(`hls.${lang}`, {
    url: file.s3Keys?.master || '',
    status: 'COMPLETE',
  })
  if (file.s3Keys?.transcript?.json) {
    setValue(`transcribe.${lang}`, file.s3Keys.transcript.json)
  }
  if (file.duration) {
    setValue(`duration.${lang}`, file.duration)
  }
}
```

Add UI in the video section:

```jsx
{/* Video Selection Section */}
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <Label>Session Video</Label>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setFilePickerOpen(true)}
    >
      <Video className="h-4 w-4 mr-2" />
      Select from Files
    </Button>
  </div>
  
  {selectedFile ? (
    <div className="p-3 bg-muted rounded-md">
      <div className="flex items-center gap-2">
        <Video className="h-5 w-5 text-blue-500" />
        <span className="font-medium">{selectedFile.name}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {selectedFile.qualities?.join(', ')} • {formatDuration(selectedFile.duration)}
      </p>
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      No video selected. Click "Select from Files" to browse available videos.
    </p>
  )}
  
  {/* File Picker Modal */}
  <FilePicker
    open={filePickerOpen}
    onOpenChange={setFilePickerOpen}
    courseId={courseId}
    onSelect={handleFileSelect}
    selectedFileId={selectedFile?._id}
    availableLanguages={course?.availableLanguages || ['en']}
    defaultLanguage={currentLanguage}
  />
</div>
```

## 5. Course Info - Show Folder Path

Update the course information page to show the folder path.

### File: `src/pages/CourseCreation/stages/CourseInformation.jsx` (MODIFY)

Add after course is created/saved:

```jsx
import FolderPathDisplay from '@/components/misc/FolderPathDisplay'

// In the render, after the course is saved (has an _id):
{course?._id && (
  <div className="space-y-2">
    <Label>Upload Folder Path (for Python Encoder)</Label>
    <FolderPathDisplay 
      courseId={course._id} 
      language={currentLanguage || 'en'} 
    />
    <p className="text-xs text-muted-foreground">
      Use this path in the Python HLS encoder to upload videos for this course
    </p>
  </div>
)}
```

## 6. Course Files Browser Page (Optional)

A dedicated page to browse all files for a course.

### File: `src/pages/CourseFiles/index.jsx`

```jsx
import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, Video, FileText, Trash2, Clock, RefreshCw } from 'lucide-react'
import { getFilesByCourse, deleteFile } from '@/services/content/fileService'
import { getCourse } from '@/services/content/course'
import { toast } from 'sonner'
import FolderPathDisplay from '@/components/misc/FolderPathDisplay'
import { formatDuration } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function CourseFilesPage() {
  const { courseId } = useParams()
  const [course, setCourse] = useState(null)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [language, setLanguage] = useState('en')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState(null)

  useEffect(() => {
    fetchCourse()
  }, [courseId])

  useEffect(() => {
    if (courseId) {
      fetchFiles()
    }
  }, [courseId, language])

  const fetchCourse = async () => {
    try {
      const res = await getCourse(courseId)
      setCourse(res.data)
    } catch (err) {
      toast.error('Failed to load course')
    }
  }

  const fetchFiles = async () => {
    setLoading(true)
    try {
      const res = await getFilesByCourse(courseId, language)
      setFiles(res.data.files || [])
    } catch (err) {
      toast.error('Failed to load files')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!fileToDelete) return

    try {
      await deleteFile(fileToDelete._id)
      toast.success('File deleted')
      fetchFiles()
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete file'
      toast.error(message)
    } finally {
      setDeleteDialogOpen(false)
      setFileToDelete(null)
    }
  }

  const confirmDelete = (file) => {
    setFileToDelete(file)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course Files</h1>
          <p className="text-muted-foreground">
            {course?.name?.en || course?.name || 'Loading...'}
          </p>
        </div>
        <Button variant="outline" onClick={fetchFiles}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Folder Path */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Folder Path</CardTitle>
        </CardHeader>
        <CardContent>
          <FolderPathDisplay courseId={courseId} language={language} />
          <p className="text-xs text-muted-foreground mt-2">
            Use this path in the Python HLS encoder to upload videos
          </p>
        </CardContent>
      </Card>

      {/* Language Filter */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Language:</span>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(course?.availableLanguages || ['en']).map((lang) => (
              <SelectItem key={lang} value={lang}>
                {lang.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {files.length} file(s)
        </span>
      </div>

      {/* Files Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <Video className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No files uploaded yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => (
            <Card key={file._id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {file.type === 'hls' ? (
                    <Video className="h-10 w-10 text-blue-500 flex-shrink-0" />
                  ) : (
                    <FileText className="h-10 w-10 text-green-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {file.duration > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(file.duration)}
                        </span>
                      )}
                    </div>
                    {file.qualities?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {file.qualities.join(' • ')}
                      </p>
                    )}
                    {file.linkedSessions?.length > 0 && (
                      <p className="text-xs text-blue-500 mt-1">
                        Linked to {file.linkedSessions.length} session(s)
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => confirmDelete(file)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{fileToDelete?.name}" from S3.
              {fileToDelete?.linkedSessions?.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Warning: This file is linked to {fileToDelete.linkedSessions.length} session(s).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

### Add Route

In `src/routes/index.jsx`:

```jsx
import CourseFilesPage from '@/pages/CourseFiles'

// Add to routes array
{
  path: '/courses/:courseId/files',
  element: <CourseFilesPage />,
}
```

## 7. Utility Functions

### File: `src/lib/utils.js` (ADD)

```javascript
/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
```

## File Structure Summary

```
admin-panel/
└── src/
    ├── services/
    │   └── content/
    │       └── fileService.js           # NEW: File API service
    ├── components/
    │   ├── modals/
    │   │   └── FilePicker/
    │   │       └── index.jsx            # NEW: File picker modal
    │   └── misc/
    │       └── FolderPathDisplay.jsx    # NEW: Folder path display
    ├── pages/
    │   ├── CourseFiles/
    │   │   └── index.jsx                # NEW: Course files browser
    │   └── CourseCreation/
    │       └── stages/
    │           └── CourseInformation.jsx # MODIFY: Add folder path
    ├── routes/
    │   └── index.jsx                    # MODIFY: Add CourseFiles route
    └── lib/
        └── utils.js                     # MODIFY: Add formatDuration
```

## Testing Checklist

- [ ] File service makes correct API calls
- [ ] FilePicker modal loads files for a course
- [ ] FilePicker filters by language
- [ ] Selecting a file updates session form fields
- [ ] FolderPathDisplay shows correct path
- [ ] FolderPathDisplay copy button works
- [ ] CourseFilesPage displays all files
- [ ] CourseFilesPage filters by language
- [ ] File deletion works (shows warning if linked)
- [ ] Session editor shows selected file info
