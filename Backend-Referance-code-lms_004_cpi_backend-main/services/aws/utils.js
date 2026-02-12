const { S3 } = require('@aws-sdk/client-s3')
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const config = require('config')
const S3_CONSTANTS = require('../../constants/s3')

const S3_BUCKET = config.get('AWS_BUCKET_NAME')
const REGION = config.get('AWS_REGION')
const accessKeyId = config.get('AWS_ACCESS_KEY_ID')
const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY')

const bucket = new S3({
	region: REGION,
	credentials: {
		accessKeyId: accessKeyId,
		secretAccessKey: secretAccessKey,
	},
})

// Helper function to extract S3 key from URL or key
function extractS3Key(url) {
	try {
		const match = url.match(/amazonaws\.com\/(.+)/)
		return match ? match[1] : url // Extract everything after 'amazonaws.com/'
	} catch (error) {
		console.error('Error extracting S3 key:', error)
		return url
	}
}

async function deleteAwsObject(fileName) {
	if (!fileName) {
		console.log('[AWS Deletion] No fileName provided, skipping deletion')
		return
	}

	const key = extractS3Key(fileName)
	if (!key) {
		console.log('[AWS Deletion] Could not extract key from fileName:', fileName)
		return
	}

	try {
		console.log(`[AWS Deletion] Deleting object: ${key}`)
		await bucket.deleteObject({
			Bucket: S3_BUCKET,
			Key: key,
		})
		console.log(`[AWS Deletion] Successfully deleted: ${key}`)
	} catch (error) {
		console.error(`[AWS Deletion] Error deleting ${key}:`, error)
		// Don't throw error to prevent session deletion from failing
	}
}

async function deleteHLSFiles(prefix) {
	console.log('[AWS Deletion] Deleting HLS files under prefix:', prefix)
	try {
		const listed = await bucket.listObjectsV2({
			Bucket: S3_BUCKET,
			Prefix: prefix,
		})

		console.log(
			'[AWS Deletion] Listed objects count:',
			listed.Contents?.length || 0
		)

		if (!listed.Contents || listed.Contents.length === 0) {
			console.log('[AWS Deletion] No files found to delete')
			return
		}

		// Log what we're about to delete
		console.log('[AWS Deletion] Files to be deleted:')
		listed.Contents.forEach((obj, index) => {
			console.log(`  ${index + 1}. ${obj.Key}`)
		})

		const deleteParams = {
			Bucket: S3_BUCKET,
			Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key })) },
		}

		const deleteResult = await bucket.deleteObjects(deleteParams)
		console.log(
			'[AWS Deletion] Deleted batch of objects:',
			deleteResult.Deleted?.length || 0,
			'files'
		)

		if (deleteResult.Errors && deleteResult.Errors.length > 0) {
			console.error(
				'[AWS Deletion] Some files failed to delete:',
				deleteResult.Errors
			)
		}

		if (listed.IsTruncated) {
			console.log('[AWS Deletion] More files exist – recursing')
			await deleteHLSFiles(prefix)
		} else {
			console.log('[AWS Deletion] All files deleted successfully')
		}
	} catch (error) {
		console.error('[AWS Deletion] Error deleting HLS files:', error)
		// Don't throw error to prevent session deletion from failing
	}
}

/**
 * Generate a presigned URL for a private S3 object with expiration time
 * @param {string} key - The S3 key (file path)
 * @param {number} expirationSeconds - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<string|undefined>} - Returns the presigned URL or undefined if key is invalid
 */
async function generateObjectUrl(
	key,
	expirationSeconds = S3_CONSTANTS.URL_EXPIRATION.DEFAULT
) {
	if (!key) return undefined

	try {
		// Extract key if full URL is provided
		const s3Key = extractS3Key(key)

		// Create GetObjectCommand for the private object
		const command = new GetObjectCommand({
			Bucket: S3_BUCKET,
			Key: s3Key,
		})

		// Generate presigned URL with expiration
		const signedUrl = await getSignedUrl(bucket, command, {
			expiresIn: expirationSeconds,
		})

		return signedUrl
	} catch (error) {
		console.error(
			`[AWS URL Generation] Error generating signed URL for ${key}:`,
			error
		)
		// Return undefined on error instead of throwing to prevent breaking the flow
		return undefined
	}
}

/**
 * Upload content to S3 with public read access by default
 * @param {Buffer|string} content - The content to upload
 * @param {string} key - The S3 key (file path)
 * @param {string} contentType - The MIME type of the content
 * @param {boolean} publicRead - Whether to make the object publicly readable (default: true)
 * @returns {Promise<Object>} - Returns the S3 key and URL
 */
async function uploadToS3(
	content,
	key,
	contentType = 'application/octet-stream',
	publicRead = true
) {
	try {
		console.log(`[AWS Upload] Uploading to S3: ${key}`)

		const uploadParams = {
			Bucket: S3_BUCKET,
			Key: key,
			Body: content,
			ContentType: contentType,
		}

		// Add public read access if requested
		if (publicRead) {
			uploadParams.ACL = 'public-read'
		}

		const command = new PutObjectCommand(uploadParams)
		await bucket.send(command)

		console.log(`[AWS Upload] Successfully uploaded: ${key}`)

		// Generate signed URL for the uploaded object
		const url = await generateObjectUrl(key)

		return {
			key: key,
			url: url,
			bucket: S3_BUCKET,
			region: REGION,
		}
	} catch (error) {
		console.error(`[AWS Upload] Error uploading ${key}:`, error)
		throw error
	}
}

module.exports = {
	deleteAwsObject,
	deleteHLSFiles,
	extractS3Key,
	generateObjectUrl,
	uploadToS3,
}
