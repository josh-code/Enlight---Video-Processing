# AWS Setup Guide (S3 Uploads + HLS + Transcripts)
This guide is tailored to your codebase (**PastorsUniversity backend + admin panel**) and your **Windows Python uploader**.

It explains:
- how to set up **AWS S3** (and optional **MediaConvert / Transcribe / Elastic Transcoder**),
- which **environment variables** your backend expects,
- how to upload into a **“folder system”** in S3 (prefix-based),
- and what to change so **HLS uploads** work correctly.

---

## 0) Architecture (what uploads what)

### Current flow in your repo
1. **Admin panel (browser)** calls backend to get a **pre‑signed PUT URL**.
2. Browser uploads directly to **S3** using that signed URL.
3. Backend stores **S3 keys** (not full URLs) in MongoDB (e.g., `Session.video.en = "uploaded-video/.../file.mp4"`).
4. Backend converts keys to URLs when serving to clients.

### Your Windows Python app flow (recommended)
Your Python app should follow the same pattern:
- **Call backend for a pre‑signed URL**
- Upload to S3 using `PUT signedUrl`
- Save the returned `key` into the session record (via backend API)

✅ This keeps **AWS credentials only on the backend** (more secure).

---

## 1) Create the S3 bucket

1. In AWS Console → **S3** → Create bucket.
2. Pick the region you’ll use everywhere (example: `ap-south-1`).
3. Bucket name example: `lms-004-pastor-university` (yours can differ).

**Important:** Your backend generates public S3 URLs like:
`https://<bucket>.s3.<region>.amazonaws.com/<key>`

So pick a bucket name without dots if possible (dots can cause TLS/URL edge cases).

---

## 2) Choose your access model (public vs private)

Your backend’s S3 presign code currently sets:
```js
ACL: "public-read"
```

Modern S3 buckets often default to **ACLs disabled** (“Bucket owner enforced”), which will break this.

### Option A (recommended): **ACLs disabled**, control access via policy/CloudFront
- Keep S3 objects **private**
- Use a bucket policy + CloudFront (best) or signed URLs (advanced)

✅ Pros: secure, best practice  
⚠️ Cons: extra setup

**Backend code change (recommended):** remove `ACL: "public-read"` from presign.
```diff
const params = {
  Bucket: S3_BUCKET,
  Key: key,
- ACL: "public-read",
};
```

### Option B (quick/easiest): **public-read objects**
- Objects are readable publicly.
- You must allow public access (bucket policy and/or ACLs).

✅ Pros: simplest  
⚠️ Cons: less secure

If you keep `ACL: "public-read"`:
- S3 Console → Bucket → **Permissions** → Object Ownership  
  - Choose **ACLs enabled** (NOT “Bucket owner enforced”)
- Bucket → **Block Public Access**
  - Turn off blocking if you want truly public read.

---

## 3) S3 CORS (required for browser uploads)
Python uploads do NOT need CORS, but your **admin panel browser upload does**.

Bucket → Permissions → **CORS configuration**:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR_ADMIN_DOMAIN",
      "https://YOUR_CLIENT_DOMAIN"
    ],
    "ExposeHeaders": ["ETag", "x-amz-request-id"],
    "MaxAgeSeconds": 3000
  }
]
```

Replace the domains with your real admin/client domains.

---

## 4) IAM: create credentials for the backend

### Recommended
If your backend runs on AWS (EC2/ECS/Lambda), use an **IAM role**.

### For local dev / VPS
Create an **IAM User** with Access Keys:
- AWS Console → IAM → Users → Create user
- Attach a policy (example below)

### Minimal IAM policy for your backend (S3 + list/delete)
Replace:
- `YOUR_BUCKET_NAME`
- `YOUR_PREFIXES` (or keep `"*"` if you want full bucket access)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    },
    {
      "Sid": "S3ObjectRW",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

---

## 5) MediaConvert setup (only if you use backend HLS conversion)
Your backend includes MediaConvert integration and expects these env vars:
- `AWS_MEDIACONVERT_ENDPOINT`
- `AWS_MEDIACONVERT_QUEUE`
- `AWS_MEDIACONVERT_ROLE`
- `AWS_HLS_DESTINATION`  (must be an S3 URI)

### 5.1 Get the MediaConvert endpoint
In AWS Console → MediaConvert → the endpoint is shown per region/account.

Or with AWS CLI:
```bash
aws mediaconvert describe-endpoints --region ap-south-1
```

Use the returned URL as `AWS_MEDIACONVERT_ENDPOINT`.

### 5.2 Create/choose a queue
Use the Default queue or create one. You’ll need its ARN:
`arn:aws:mediaconvert:REGION:ACCOUNT:queues/Default`

### 5.3 Create an IAM role for MediaConvert
- Trust relationship must allow `mediaconvert.amazonaws.com`
- Permissions must allow reading your input keys and writing to your HLS destination prefix.

Example destination (recommended):
- `AWS_HLS_DESTINATION = s3://YOUR_BUCKET_NAME/hls/`

---

## 6) AWS Transcribe setup (only if you use backend transcribing)
Your backend uses AWS Transcribe and writes transcripts to S3 under keys like:
- `transcript/<lang>/Transcription_session_<sessionId>_<lang>_<uuid>.json`

IAM policy needs Transcribe actions, example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TranscribeAccess",
      "Effect": "Allow",
      "Action": [
        "transcribe:StartTranscriptionJob",
        "transcribe:GetTranscriptionJob",
        "transcribe:ListTranscriptionJobs"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 7) Elastic Transcoder setup (only if you use backend “compressVideo”)
Your backend contains Elastic Transcoder job creation and expects:
- `AWS_TRANSCODER_PIPELINE_ID`
- `AWS_PRESET_ID_360P`, `AWS_PRESET_ID_480P`, `AWS_PRESET_ID_720P`, `AWS_PRESET_ID_1080P`

If you are NOT using that feature, you can skip it.

---

## 8) Backend environment variables (IMPORTANT)
Your backend uses the `config` npm package with `custom-environment-variables.json`.

That file maps your config keys to env vars with the **`lms_` prefix**.

### Required AWS env vars
Set these at minimum:

| Config Key | Environment Variable |
|---|---|
| `AWS_ACCESS_KEY_ID` | `lms_aws_access_key_id` |
| `AWS_SECRET_ACCESS_KEY` | `lms_aws_secret_access_key` |
| `AWS_REGION` | `lms_aws_region` |
| `AWS_BUCKET_NAME` | `lms_aws_bucket` |

### Optional (MediaConvert / Transcribe / Transcoder)
| Config Key | Environment Variable |
|---|---|
| `AWS_MEDIACONVERT_ENDPOINT` | `lms_AWS_MEDIACONVERT_ENDPOINT` |
| `AWS_MEDIACONVERT_QUEUE` | `lms_AWS_MEDIACONVERT_QUEUE` |
| `AWS_MEDIACONVERT_ROLE` | `lms_AWS_MEDIACONVERT_ROLE` |
| `AWS_HLS_DESTINATION` | `lms_AWS_HLS_DESTINATION` |
| `AWS_TRANSCODER_PIPELINE_ID` | `lms_AWS_TRANSCODER_PIPELINE_ID` |
| `AWS_PRESET_ID_360P` | `lms_AWS_PRESET_ID_360P` |
| `AWS_PRESET_ID_480P` | `lms_AWS_PRESET_ID_480P` |
| `AWS_PRESET_ID_720P` | `lms_AWS_PRESET_ID_720P` |
| `AWS_PRESET_ID_1080P` | `lms_AWS_PRESET_ID_1080P` |

### Windows PowerShell examples
```powershell
$env:lms_aws_access_key_id="AKIA..."
$env:lms_aws_secret_access_key="SECRET..."
$env:lms_aws_region="ap-south-1"
$env:lms_aws_bucket="YOUR_BUCKET_NAME"
```

> Note: your repo does not include a `config/default.json`. If you get `Error: Configuration property "AWS_BUCKET_NAME" is not defined`,
> you can either:
> 1) add a `config/default.json` with those keys, OR
> 2) set `NODE_CONFIG` with JSON containing required keys, OR
> 3) ensure the environment variables are being read correctly in your runtime.

---

## 9) “Folder system” in S3 (how to make your videos show correctly)
S3 “folders” are **prefixes**.

So if you want the UI to browse:
- Course → Session → Language → Video

Use keys like:
- `uploaded-video/<courseId>/<sessionId>/<lang>/<file>.mp4`

### Good default key conventions
- Raw mp4 uploads:
  - `uploaded-video/<courseId>/<sessionId>/<lang>/...`
- HLS (folder upload):
  - `hls/<courseId>/<sessionId>/<lang>/master.m3u8`
  - `hls/<courseId>/<sessionId>/<lang>/seg_00001.ts`
- Transcripts:
  - `transcript/<courseId>/<sessionId>/<lang>/transcript.json`

---

## 10) Backend presign endpoints (what you have + what you should add)

### Existing endpoint (already in your repo)
Used for single uploads (but renames file with timestamp):
- `GET /api/admin/content/aws/uploadUrl/:fileName?folderName=...`

✅ You can pass nested folderName like:
- `folderName=uploaded-video/<courseId>/<sessionId>/<lang>`

### Required for HLS uploads: presign “exact key”
HLS requires exact filenames (playlist references segments).
Add this endpoint:

**Route:**
- `POST /api/admin/content/aws/uploadUrl`
Body:
```json
{ "key": "hls/<courseId>/<sessionId>/<lang>/master.m3u8" }
```

**Service function (example):**
```js
async function generatePreSignedUploadUrlForKey(key) {
  const cleanedKey = key.replace(/^\/+/, "");
  const params = { Bucket: S3_BUCKET, Key: cleanedKey };
  const signedUrl = await getSignedUrl(bucket, new PutObjectCommand(params), { expiresIn: 3600 });
  return { key: cleanedKey, signedUrl, downloadUrl: generateObjectUrl(cleanedKey) };
}
```

---

## 11) Python uploader checklist (Windows app)

### 11.1 Don’t put AWS keys in your Python app (recommended)
Use the admin JWT token and call the backend presign endpoint.

### 11.2 Compute the S3 prefix from the UI selection
When user chooses:
- courseId
- sessionId
- lang

Your Python app computes:
- `uploaded-video/<courseId>/<sessionId>/<lang>` (for mp4)
- `hls/<courseId>/<sessionId>/<lang>` (for HLS folder)
- `transcript/<courseId>/<sessionId>/<lang>` (for transcript file)

### 11.3 Upload steps
1. Call backend presign
2. `PUT signedUrl` with file bytes
3. Save returned `key` into Session record using your backend session update endpoint.

---

## 12) Troubleshooting

### Error: `AccessControlListNotSupported`
Cause: your bucket has **Object Ownership = Bucket owner enforced (ACLs disabled)**.

Fix:
- Remove `ACL: "public-read"` from backend presign code, OR
- Change bucket Object Ownership to **ACLs enabled**.

### Error: `SignatureDoesNotMatch` or 403 on PUT
Cause: request headers don’t match what was signed.

Fix options:
- If you keep `ACL: "public-read"` in the presign command, you may need to include:
  - `x-amz-acl: public-read` header in the PUT request
- Or remove ACL from presign to avoid it.

### HLS doesn’t play (m3u8 loads but segments 404)
Cause: segment filenames don’t match what playlist references.

Fix:
- Use **exact-key presign** and upload HLS folder preserving filenames.

### Browser upload shows CORS error
Fix:
- Add/adjust S3 bucket CORS with correct `AllowedOrigins`.

---

## 13) What you should store in MongoDB after upload
To make the course/session page point to the uploaded content:

- Raw video:
  - `Session.video[lang] = "<uploaded s3 key>"`

- HLS:
  - `Session.hls[lang].outputPrefix = "s3://<bucket>/hls/<courseId>/<sessionId>/<lang>/"`
  - `Session.hls[lang].url = "hls/<courseId>/<sessionId>/<lang>/master.m3u8"` (or your main playlist key)
  - `Session.hls[lang].status = "COMPLETE"`

- Transcript:
  - `Session.transcribe[lang] = "transcript/<courseId>/<sessionId>/<lang>/transcript.json"`

---

## 14) Quick “done” checklist
- [ ] S3 bucket created in correct region
- [ ] Bucket CORS configured (for admin panel)
- [ ] IAM policy applied to backend (S3 + optional MediaConvert/Transcribe)
- [ ] Backend env vars set (`lms_aws_*`)
- [ ] Presign endpoints working
- [ ] (For HLS) exact-key presign endpoint added
- [ ] Python app uploads into prefixes that match your folder system
- [ ] Session DB updated with returned keys so UI can select/play

