const express = require('express')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const {
	generatePreSignedUploadUrl,
	deleteAwsObject,
	getJobUpdate,
	compressVideo,
	makeAssetPublic,
	startTranscription,
	getTranscriptionJobByName,
	handleSNSNotification,
	createHLSJob,
} = require('../../../../services/aws')
const { Session } = require('../../../../models/common/content/session_model')
const {
	TRANSCRIBE_JOB_PREFIX,
	TRANSCRIBE_STATUS,
	VIDEO_JOB_PREFIX,
} = require('../../../../contant')
const { Course } = require('../../../../models/common/content/course_model')
const axios = require('axios')
const { v4: uuidv4 } = require('uuid')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

const router = express.Router()

router.get(
	'/uploadUrl/:fileName',
	catchAsyncError(async (req, res, next) => {
		const fileName = req.params.fileName
		const folderName = req.query.folderName

		if (!folderName || !fileName) {
			return next(new ErrorHandler('Invalid request', HTTP.BAD_REQUEST))
		}

		const uploadRes = await generatePreSignedUploadUrl(fileName, folderName)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: uploadRes,
			message: 'Upload URL generated successfully',
		})
	})
)

router.post(
	'/compressVideo',
	catchAsyncError(async (req, res, next) => {
		const { key, lang, courseId, sessionId } = req.body

		if (!key || !lang) {
			return next(
				new ErrorHandler(
					'Invalid request payload: key and lang are required.',
					HTTP.BAD_REQUEST
				)
			)
		}

		if (!sessionId && !courseId) {
			return next(
				new ErrorHandler(
					'Invalid request payload: either sessionId or courseId must be provided.',
					HTTP.BAD_REQUEST
				)
			)
		}

		const jobStatus = await compressVideo(key, courseId, sessionId, lang)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: jobStatus,
			message: 'Video compression started',
		})
	})
)

router.post(
	'/jobComplete',
	catchAsyncError(async (req, res, next) => {
		console.log('compression job completed: ', req.body)

		const jobId = req.body.jobId
		const outputs = req.body.outputs
		const originalVideoKey = req.body.input.key

		deleteAwsObject(originalVideoKey)

		const compressedVideoKeys = outputs
			.map((output) => output?.key)
			.filter(Boolean)

		const publicResults = await Promise.allSettled(
			compressedVideoKeys.map((key) => makeAssetPublic(key))
		)

		// Log any errors from making assets public
		publicResults.forEach((result, index) => {
			if (result.status === 'rejected') {
				console.error(
					`Error making asset public for key ${compressedVideoKeys[index]}:`,
					result.reason
				)
			}
		})

		console.log({ compressedVideoKeys })

		const match = compressedVideoKeys[0].match(
			/^compressed\/[^/]+\/(?:360|480|720|1080)\/(Video_session_|Video_course_)([^_]+)_([a-z]{2})_(?:360|480|720|1080)p_([^/]+)\.mp4$/
		)

		if (!match) {
			throw new Error(
				'Invalid video key format, unable to extract ID and prefix'
			)
		}

		const prefix = match[1] // "Video_session_" or "Video_course_"
		const id = match[2] // Session or Course ID
		const lang = match[3] // Language (e.g., "en", "es", etc.)
		const uniqueJobId = match[4] // Unique Job ID

		let sessionId = null
		let courseId = null

		if (prefix === VIDEO_JOB_PREFIX.SESSION) {
			sessionId = id
			console.log('Determined as session ID: ', sessionId)
		} else if (prefix === VIDEO_JOB_PREFIX.COURSE) {
			courseId = id
			console.log('Determined as course ID: ', courseId)
		} else {
			throw new Error('Prefix does not match any known patterns')
		}

		// Trigger transcription only for the 1080p output
		let compressedVideoKeyForTranscription =
			compressedVideoKeys.find((key) => key.includes('1080')) ||
			compressedVideoKeys.find((key) => key.includes('720')) ||
			compressedVideoKeys[0]

		if (compressedVideoKeyForTranscription) {
			await startTranscription(
				compressedVideoKeyForTranscription,
				sessionId,
				courseId,
				uniqueJobId,
				lang
			)
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Job completed successfully',
		})
	})
)

router.post(
	'/getJobUpdate',
	catchAsyncError(async (req, res, next) => {
		const jobId = req.body.jobId
		const key = req.body.key

		const jobStatus = await getJobUpdate(jobId, key)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: jobStatus,
			message: 'Job status fetched successfully',
		})
	})
)

router.put(
	'/deleteFile',
	catchAsyncError(async (req, res, next) => {
		const fileName = req.body.fileName

		const deleteRes = await deleteAwsObject(fileName)
		console.log(deleteRes)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'File deleted successfully',
		})
	})
)

router.post(
	'/transcribeJobStatus',
	catchAsyncError(async (req, res, next) => {
		console.log('Received SNS notification: ', req.body)

		const detail = req.body.detail
		const { TranscriptionJobName, TranscriptionJobStatus } = detail

		if (TranscriptionJobStatus === TRANSCRIBE_STATUS.COMPLETED) {
			const match = TranscriptionJobName.match(
				/(Transcription_session_|Transcription_course_)([^_]+)_([^_]+)_([^/]+)$/
			)

			if (!match) {
				console.error(
					'Invalid transcription job name format, unable to extract ID and prefix'
				)
				return sendResponse({
					res,
					status: true,
					code: HTTP.OK,
					data: null,
					message: 'Invalid transcription job name format',
				})
			}

			// Destructure the match groups for clarity:
			const [, prefix, id, lang, uniqueJobId] = match

			console.log({ prefix, id, lang, uniqueJobId })

			if (prefix === TRANSCRIBE_JOB_PREFIX.SESSION) {
				console.log('Identified as session transcription job. Session ID: ', id)
				await handleSessionTranscriptionCompletion(id, uniqueJobId, lang)
			} else if (prefix === TRANSCRIBE_JOB_PREFIX.COURSE) {
				console.log('Identified as course transcription job. Course ID: ', id)
				await handleCourseTranscriptionCompletion(id, uniqueJobId, lang)
			}

			console.log('Extracted Unique Job ID: ', uniqueJobId)
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'Transcription job completed',
			})
		} else {
			console.log(
				'Transcription job not completed yet. Current status: ',
				TranscriptionJobStatus
			)
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'Job in progress or failed',
			})
		}
	})
)

async function handleSessionTranscriptionCompletion(
	sessionId,
	uniqueJobId,
	lang
) {
	try {
		console.log(
			`Handling transcription completion for session ID: ${sessionId}`
		)
		const session = await Session.findById(sessionId)
		if (!session) {
			console.error(`Session with ID ${sessionId} not found`)
			throw new Error(`Session with ID ${sessionId} not found`)
		}

		const jobName = `${TRANSCRIBE_JOB_PREFIX.SESSION}${sessionId}_${lang}_${uniqueJobId}`
		console.log(`Fetching transcription job with name: ${jobName}`)
		const transcriptionJob = await getTranscriptionJobByName(jobName)

		console.log('Fetched transcription job: ', transcriptionJob)

		if (
			transcriptionJob.TranscriptionJobStatus === TRANSCRIBE_STATUS.COMPLETED
		) {
			const newKey = `transcript/${lang}/${jobName}.json`
			console.log('Storing transcription key: ', newKey)

			makeAssetPublic(newKey)
				.then(() => {
					console.log('Asset made public')
				})
				.catch((error) => {
					console.error('Error making asset public:', error)
				})

			if (
				session.transcribe &&
				typeof session.transcribe === 'string' &&
				session.transcribe !== newKey
			) {
				console.log(
					'Existing transcription key found. Deleting AWS object for key:',
					session.transcribe
				)
				await deleteAwsObject(session.transcribe)
			}

			await Session.findByIdAndUpdate(sessionId, {
				$set: {
					[`transcribe.${lang}`]: newKey,
				},
			})

			console.log(`Transcription data saved for session ${sessionId}`)
		}
	} catch (error) {
		console.error('Error handling session transcription completion: ', error)
		throw error
	}
}

async function handleCourseTranscriptionCompletion(
	courseId,
	uniqueJobId,
	lang
) {
	try {
		const course = await Course.findById(courseId)
		if (!course) {
			console.error(`Course with ID ${courseId} not found`)
			throw new Error(`Course with ID ${courseId} not found`)
		}

		const jobName = `${TRANSCRIBE_JOB_PREFIX.COURSE}${courseId}_${lang}_${uniqueJobId}`
		const transcriptionJob = await getTranscriptionJobByName(jobName)

		if (
			transcriptionJob.TranscriptionJobStatus === TRANSCRIBE_STATUS.COMPLETED
		) {
			const newKey = `transcript/${lang}/${jobName}.json`

			makeAssetPublic(newKey)
				.then(() => {})
				.catch((error) => {
					console.error('Error making asset public:', error)
				})

			if (
				course.transcribe &&
				typeof course.transcribe === 'string' &&
				course.transcribe !== newKey
			) {
				await deleteAwsObject(course.transcribe)
			}

			await Course.findByIdAndUpdate(courseId, {
				$set: {
					[`IntroVideoTranscribe.${lang}`]: newKey,
				},
			})

			console.log(`Transcription data saved for course ${courseId}`)
		}
	} catch (error) {
		console.error('Error handling course transcription completion: ', error)
		throw error
	}
}

// Add SNS endpoint for MediaConvert notifications
router.post(
	'/mediaconvert-notification',
	catchAsyncError(async (req, res, next) => {
		const messageType = req.headers['x-amz-sns-message-type']

		if (!messageType) {
			console.warn('[SNS] Missing message type header')
			return next(
				new ErrorHandler('Missing SNS message type', HTTP.BAD_REQUEST)
			)
		}

		if (messageType === 'SubscriptionConfirmation') {
			const subscribeUrl = req.body.SubscribeURL
			await axios.get(subscribeUrl)
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'Subscription confirmed',
			})
		}

		if (messageType === 'Notification') {
			await handleSNSNotification(req.body)
			console.log('[SNS] Notification processed')
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'Notification processed',
			})
		}

		return next(new ErrorHandler('Invalid message type', HTTP.BAD_REQUEST))
	})
)

router.post(
	'/start-hls-conversion',
	catchAsyncError(async (req, res, next) => {
		console.log('[HLS] Received start request:', req.body)
		const { sessionId, videoKey, language } = req.body

		if (!sessionId || !videoKey || !language) {
			console.warn('[HLS] Missing parameters', {
				sessionId,
				videoKey,
				language,
			})
			return next(
				new ErrorHandler('Missing required parameters', HTTP.BAD_REQUEST)
			)
		}

		const outputPrefix = `${language}/${sessionId}`

		console.log('[HLS] Creating MediaConvert job', {
			videoKey,
			outputPrefix,
			language,
		})

		const result = await createHLSJob(
			videoKey,
			outputPrefix,
			{
				sessionId,
				language,
			},
			language
		)

		console.log('[HLS] Job created successfully:', result)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: result,
			message: 'HLS conversion started',
		})
	})
)

// Get HLS status for a session
router.get(
	'/hls-status/:sessionId',
	catchAsyncError(async (req, res, next) => {
		const { sessionId } = req.params
		const { language } = req.query

		console.log(
			'[HLS] Getting status for session:',
			sessionId,
			'language:',
			language
		)

		if (language) {
			// Get status for specific language
			const status = await getHLSStatus(sessionId, language)
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: status,
				message: 'HLS status fetched successfully',
			})
		} else {
			// Get status for all languages
			const statuses = await getAllHLSStatuses(sessionId)
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: statuses,
				message: 'HLS statuses fetched successfully',
			})
		}
	})
)

router.post(
	'/startTranscription',
	catchAsyncError(async (req, res, next) => {
		const { key, lang, sessionId, courseId } = req.body

		// Validate required fields
		if (!key || !lang) {
			return next(
				new ErrorHandler(
					'Missing required fields: key, uniqueJobId, and lang are required',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate language
		if (!['en', 'es'].includes(lang)) {
			return next(
				new ErrorHandler(
					"Invalid language. Only 'en' or 'es' are supported",
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate that either sessionId OR courseId is provided, but not both
		if (!sessionId && !courseId) {
			return next(
				new ErrorHandler(
					'Either sessionId or courseId is required',
					HTTP.BAD_REQUEST
				)
			)
		}

		if (sessionId && courseId) {
			return next(
				new ErrorHandler(
					'Provide either sessionId OR courseId, not both',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate UUID format for uniqueJobId
		const uniqueJobId = uuidv4()

		console.log(`[Transcription] Starting transcription:`, {
			key,
			uniqueJobId,
			lang,
			sessionId: sessionId || null,
			courseId: courseId || null,
		})

		// Start transcription
		await startTranscription(key, sessionId, courseId, uniqueJobId, lang)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				jobId: uniqueJobId,
				status: 'STARTED',
				language: lang,
			},
			message: 'Transcription started successfully',
		})
	})
)

module.exports = router
