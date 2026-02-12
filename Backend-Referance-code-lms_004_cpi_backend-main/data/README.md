# Sample Course Data for MongoDB Import

This directory contains sample JSON data files for importing course content into MongoDB using MongoDB Compass.

## Files

- `sample_courses.json` - Contains 3 sample courses (1 modular, 1 non-modular, 1 modular)
- `sample_modules.json` - Contains 6 sample modules (for modular courses)
- `sample_sessions.json` - Contains 9 sample sessions

## Import Order

**Important:** You must import the data in the following order and update references:

### Step 1: Import Courses

1. Open MongoDB Compass
2. Connect to your database
3. Navigate to the `courses` collection
4. Click "Add Data" → "Import File"
5. Select `sample_courses.json`
6. After import, note the `_id` values for each course:
   - Course 1: "Introduction to Web Development" (modular)
   - Course 2: "Advanced JavaScript Mastery" (non-modular)
   - Course 3: "Full Stack Development with React and Node.js" (modular)

### Step 2: Import Modules

1. Navigate to the `modules` collection
2. Import `sample_modules.json`
3. **Update module `course` references:**
   - Modules 1-3 (HTML Fundamentals, CSS Styling, JavaScript Basics) → Course 1 ID
   - Modules 4-6 (React Frontend, Node.js Backend, Deployment and DevOps) → Course 3 ID
4. Note the `_id` values for each module

### Step 3: Import Sessions

1. Navigate to the `sessions` collection
2. Import `sample_sessions.json`
3. **Update session references:**
   - Sessions 1-3 → Course 1 ID (and assign to appropriate modules)
   - Sessions 4-5 → Course 2 ID (non-modular, no moduleId)
   - Sessions 6-8 → Course 3 ID (and assign to appropriate modules)
4. **Update `courseId` and `moduleId` fields:**
   - For Course 1 (modular):
     - Session 1 → Course 1 ID, Module 1 ID
     - Session 2 → Course 1 ID, Module 1 ID
     - Session 3 → Course 1 ID, Module 2 ID
   - For Course 2 (non-modular):
     - Session 4 → Course 2 ID, no moduleId
     - Session 5 → Course 2 ID, no moduleId
   - For Course 3 (modular):
     - Session 6 → Course 3 ID, Module 4 ID
     - Session 7 → Course 3 ID, Module 5 ID
     - Session 8 → Course 3 ID, Module 5 ID

### Step 4: Update Course References

1. Update each course's `modules` array with the appropriate module IDs
2. Update each course's `sessions` array with the appropriate session IDs

## Course Structure

### Course 1: Introduction to Web Development (Modular)

- **Modules:**
  - Module 1: HTML Fundamentals
  - Module 2: CSS Styling
  - Module 3: JavaScript Basics
- **Sessions:**
  - Session 1: Introduction to HTML (Module 1)
  - Session 2: HTML Tags and Attributes (Module 1)
  - Session 3: CSS Selectors and Properties (Module 2)

### Course 2: Advanced JavaScript Mastery (Non-Modular)

- **Sessions:**
  - Session 4: JavaScript Variables and Functions
  - Session 5: Async/Await and Promises

### Course 3: Full Stack Development with React and Node.js (Modular)

- **Modules:**
  - Module 4: React Frontend
  - Module 5: Node.js Backend
  - Module 6: Deployment and DevOps
- **Sessions:**
  - Session 6: React Components and Props (Module 4)
  - Session 7: Express.js API Development (Module 5)
  - Session 8: (Additional session can be added)

## Language Support

All content includes translations for 10 languages:

- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Russian (ru)
- Chinese (zh)
- Japanese (ja)
- Korean (ko)

## HLS Video URLs

Each session includes HLS video URLs for all 10 languages. The HLS structure includes:

- `jobId`: Processing job identifier
- `status`: Processing status (completed)
- `outputPrefix`: S3 bucket path
- `url`: HLS master playlist URL
- `createdAt` / `updatedAt`: Timestamps

## Quiz Data

Some sessions include quiz data (language-agnostic):

- Session 1: HTML quiz (1 question)
- Session 4: JavaScript quiz (2 questions)

## Notes

- All Map fields (name, description, video, etc.) are represented as objects in JSON
- MongoDB will automatically convert these objects to Map types when imported
- The `attachment` field is an empty object `{}` for sessions without attachments
- Duration is stored in seconds
- All courses have `isDraft: false` and are ready for release
- `availableLanguages` and `releasedLanguages` arrays are included for all courses

## Quick Update Script (Optional)

After importing, you can use MongoDB Compass's aggregation pipeline or a script to update references automatically. Here's a sample approach:

1. Find all courses and store their IDs
2. Find all modules and update their `course` field
3. Find all sessions and update their `courseId` and `moduleId` fields
4. Update courses with `modules` and `sessions` arrays
