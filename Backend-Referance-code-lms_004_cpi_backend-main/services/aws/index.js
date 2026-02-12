const { ElasticTranscoder } = require('@aws-sdk/client-elastic-transcoder')
const { MediaConvert } = require('@aws-sdk/client-mediaconvert')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { PutObjectCommand, S3 } = require('@aws-sdk/client-s3')
const { Transcribe } = require('@aws-sdk/client-transcribe')
const { v4: uuidv4 } = require('uuid')
const config = require('config')
const S3_CONSTANTS = require('../../constants/s3')
const {
	TRANSCRIBE_JOB_PREFIX,
	VIDEO_JOB_PREFIX,
	LANGUAGE_CODE,
} = require('../../contant')
const { Session } = require('../../models/common/content/session_model')
const {
	deleteAwsObject,
	deleteHLSFiles,
	generateObjectUrl,
} = require('./utils')

const S3_BUCKET = config.get('AWS_BUCKET_NAME')
const REGION = config.get('AWS_REGION')
const accessKeyId = config.get('AWS_ACCESS_KEY_ID')
const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY')
const transCoderPipelineId = config.get('AWS_TRANSCODER_PIPELINE_ID')
const AWS_PRESET_ID_360P = config.get('AWS_PRESET_ID_360P')
const AWS_PRESET_ID_480P = config.get('AWS_PRESET_ID_480P')
const AWS_PRESET_ID_720P = config.get('AWS_PRESET_ID_720P')
const AWS_PRESET_ID_1080P = config.get('AWS_PRESET_ID_1080P')
const mediaConvertEndpoint = config.get('AWS_MEDIACONVERT_ENDPOINT')
const mediaConvertQueue = config.get('AWS_MEDIACONVERT_QUEUE')
const hlsDestination = config.get('AWS_HLS_DESTINATION')
const mediaConvertRole = config.get('AWS_MEDIACONVERT_ROLE')

const bucket = new S3({
	region: REGION,
	credentials: {
		accessKeyId: accessKeyId,
		secretAccessKey: secretAccessKey,
	},
})
const transcribe = new Transcribe({
	region: REGION,
	credentials: {
		accessKeyId: accessKeyId,
		secretAccessKey: secretAccessKey,
	},
})
const mediaConvert = new MediaConvert({
	endpoint: mediaConvertEndpoint,
	region: REGION,
	credentials: {
		accessKeyId: accessKeyId,
		secretAccessKey: secretAccessKey,
	},
})

function getExtension(fileName) {
	let arr = fileName.split('.')
	let extension = arr[arr.length - 1]
	arr.pop()
	let name = arr.join('')
	return { name, extension }
}

function sanitizeFileName(name) {
	return name
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9\-_]/g, '')
}

async function generatePreSignedUploadUrl(fileName, folderName) {
	const { name, extension } = getExtension(fileName)
	const sanitizedName = sanitizeFileName(name)
	const time = new Date().getTime()

	const key = `${folderName}/${sanitizedName}-${time}.${extension}`

	const params = {
		Bucket: S3_BUCKET,
		Key: key,
		ACL: 'public-read',
	}

	let res = await getSignedUrl(bucket, new PutObjectCommand(params), {
		expiresIn: S3_CONSTANTS.URL_EXPIRATION.LONG, // 1 hour in seconds
	})

	return {
		key: params.Key,
		signedUrl: res,
		downloadUrl: await generateObjectUrl(params.Key),
	}
}

async function compressVideo(key, courseId, sessionId, lang) {
	const transcoder = new ElasticTranscoder({
		region: REGION,
		credentials: {
			accessKeyId: accessKeyId,
			secretAccessKey: secretAccessKey,
		},
	})
	const inputKey = key

	const videoBasePath = `compressed/${lang}`

	const videoPrefix = sessionId
		? `${VIDEO_JOB_PREFIX.SESSION}${sessionId}_${lang}`
		: courseId
			? `${VIDEO_JOB_PREFIX.COURSE}${courseId}_${lang}`
			: (() => {
					throw new Error('Either sessionId or courseId must be provided')
				})()

	const uniqueId = uuidv4()

	const outputKey360 = `${videoBasePath}/360/${videoPrefix}_360p_${uniqueId}.mp4`
	const outputKey480 = `${videoBasePath}/480/${videoPrefix}_480p_${uniqueId}.mp4`
	const outputKey720 = `${videoBasePath}/720/${videoPrefix}_720p_${uniqueId}.mp4`
	const outputKey1080 = `${videoBasePath}/1080/${videoPrefix}_1080p_${uniqueId}.mp4`

	transcoder.createJob({
		PipelineId: transCoderPipelineId,
		Input: {
			Key: inputKey,
		},
		Outputs: [
			{
				Key: outputKey360,
				PresetId: AWS_PRESET_ID_360P,
			},
			{
				Key: outputKey480,
				PresetId: AWS_PRESET_ID_480P,
			},
			{
				Key: outputKey720,
				PresetId: AWS_PRESET_ID_720P,
			},
			{
				Key: outputKey1080,
				PresetId: AWS_PRESET_ID_1080P,
			},
		],
	})
	return {
		downloadUrls: {
			360: await generateObjectUrl(outputKey360),
			480: await generateObjectUrl(outputKey480),
			720: await generateObjectUrl(outputKey720),
			1080: await generateObjectUrl(outputKey1080),
		},
		tempDownloadUrl: await generateObjectUrl(key),
		keys: {
			360: outputKey360,
			480: outputKey480,
			720: outputKey720,
			1080: outputKey1080,
		},
	}
}

async function getJobUpdate(jobId, key) {
	const transcoder = new ElasticTranscoder({
		region: REGION,

		credentials: {
			accessKeyId: accessKeyId,
			secretAccessKey: secretAccessKey,
		},
	})
	let data = await transcoder.readJob({ Id: jobId })
	if (data.Job.Status === 'Complete') {
		try {
			await bucket.putObjectAcl({
				Bucket: S3_BUCKET,
				Key: key,
				ACL: 'public-read',
			})
		} catch (error) {
			console.log(error)
		}
		data.Job.Output.downloadUrl = await generateObjectUrl(key)
	}
	return data
}

async function makeAssetPublic(key) {
	try {
		await bucket.putObjectAcl({
			Bucket: S3_BUCKET,
			Key: key,
			ACL: 'public-read',
		})
	} catch (error) {
		console.log(error)
	}
	return true
}

async function startTranscription(
	key,
	sessionId = null,
	courseId = null,
	uniqueJobId,
	lang
) {
	let jobName = ''

	if (sessionId) {
		jobName = `${TRANSCRIBE_JOB_PREFIX.SESSION}${sessionId}_${lang}`
	} else if (courseId) {
		jobName = `${TRANSCRIBE_JOB_PREFIX.COURSE}${courseId}_${lang}`
	} else {
		throw new Error('Either sessionId or courseId must be provided')
	}

	jobName += `_${uniqueJobId}`

	// Generate presigned URL for transcription service
	const mediaFileUri = await generateObjectUrl(key)

	const params = {
		TranscriptionJobName: jobName,
		LanguageCode: lang === 'en' ? LANGUAGE_CODE.EN_US : LANGUAGE_CODE.ES_US,
		Media: {
			MediaFileUri: mediaFileUri,
		},
		OutputBucketName: S3_BUCKET,
		OutputKey: `transcript/${lang}/${jobName}.json`,
	}

	try {
		const data = await transcribe.startTranscriptionJob(params)
		// console.log("Transcription job started:", data);
		return data
	} catch (err) {
		console.error('Error starting transcription job:', err)
		throw err
	}
}

async function getTranscriptionJobByName(jobName) {
	try {
		const params = {
			TranscriptionJobName: jobName,
		}

		const data = await transcribe.getTranscriptionJob(params)
		return data.TranscriptionJob
	} catch (error) {
		console.error(`Error fetching transcription job ${jobName}:`, error)
		throw error
	}
}

// MediaConvert Functions
async function createHLSJob(inputFile, outputPrefix, metadata = {}) {
	try {
		// Define quality configurations
		const qualityConfigs = [
			// {
			//   name: "360",
			//   width: 640,
			//   height: 360,
			//   maxBitrate: 600000,
			// },
			{
				name: '480',
				width: 854,
				height: 480,
				maxBitrate: 1200000,
			},
			{
				name: '720',
				width: 1280,
				height: 720,
				maxBitrate: 2500000,
			},
			// {
			//   name: "1080",
			//   width: 1920,
			//   height: 1080,
			//   maxBitrate: 4500000,
			// },
		]

		// Create job settings using the quality configurations
		const jobSettings = {
			TimecodeConfig: { Source: 'ZEROBASED' },
			OutputGroups: [
				{
					Name: 'Apple HLS',
					OutputGroupSettings: {
						Type: 'HLS_GROUP_SETTINGS',
						HlsGroupSettings: {
							SegmentLength: 10,
							Destination: `${hlsDestination}${outputPrefix}/`,
							DestinationSettings: {
								S3Settings: {
									StorageClass: 'STANDARD',
									AccessControl: {
										CannedAcl: 'PUBLIC_READ',
									},
								},
							},
							SegmentsPerSubdirectory: 100,
							MinSegmentLength: 0,
							DirectoryStructure: 'SUBDIRECTORY_PER_STREAM',
						},
					},
					Outputs: qualityConfigs.map((config) => ({
						ContainerSettings: {
							Container: 'M3U8',
							M3u8Settings: {},
						},
						VideoDescription: {
							Width: config.width,
							Height: config.height,
							CodecSettings: {
								Codec: 'H_264',
								H264Settings: {
									MaxBitrate: config.maxBitrate,
									RateControlMode: 'QVBR',
									SceneChangeDetect: 'TRANSITION_DETECTION',
								},
							},
						},
						AudioDescriptions: [
							{
								AudioSourceName: 'Audio Selector 1',
								CodecSettings: {
									Codec: 'AAC',
									AacSettings: {
										Bitrate: 128000,
										CodingMode: 'CODING_MODE_2_0',
										SampleRate: 48000,
									},
								},
							},
						],
						OutputSettings: {
							HlsSettings: {},
						},
						NameModifier: `_${config.name}`,
					})),
				},
			],
			FollowSource: 1,
			Inputs: [
				{
					AudioSelectors: {
						'Audio Selector 1': {
							DefaultSelection: 'DEFAULT',
						},
					},
					VideoSelector: {},
					TimecodeSource: 'ZEROBASED',
					FileInput: `s3://${S3_BUCKET}/${inputFile}`,
				},
			],
		}

		const job = await mediaConvert.createJob({
			Role: mediaConvertRole,
			Queue: mediaConvertQueue,
			Settings: jobSettings,
			StatusUpdateInterval: 'SECONDS_60',
			Priority: 0,
			BillingTagsSource: 'JOB',
			AccelerationSettings: {
				Mode: 'DISABLED',
			},
			UserMetadata: metadata,
		})
		console.log('job created')

		console.log('[MC createHLSJob] Job created:', {
			jobId: job.Job.Id,
			status: job.Job.Status,
			outputPrefix: `${hlsDestination}${outputPrefix}/`,
		})

		return {
			jobId: job.Job.Id,
			status: job.Job.Status,
			outputPrefix: `${hlsDestination}${outputPrefix}/`,
		}
	} catch (error) {
		console.error('[MC createHLSJob] Error creating job:', error)
		throw error
	}
}

async function handleSNSNotification(message) {
	// console.log("[MC handleSNSNotification] Received message:", message);
	try {
		// If message is a string, parse it
		const messageBody =
			typeof message === 'string' ? JSON.parse(message) : message

		// Extract the detail from the message body
		const detail = messageBody.body?.detail || messageBody.detail

		if (!detail) {
			console.warn('[MC handleSNSNotification] No detail found in message')
			return
		}

		// console.log("[MC handleSNSNotification] Parsed detail:", detail);

		// Find session with jobId in either hls.en or hls.es
		const session = await Session.findOne({
			$or: [{ 'hls.en.jobId': detail.jobId }, { 'hls.es.jobId': detail.jobId }],
		})

		if (!session) {
			console.warn(
				`[MC handleSNSNotification] No session found for job ${detail.jobId}`
			)
			return
		}

		// Determine which language this job belongs to
		let language = 'en' // default
		if (session.hls?.en?.jobId === detail.jobId) {
			language = 'en'
		} else if (session.hls?.es?.jobId === detail.jobId) {
			language = 'es'
		}

		const update = {
			[`hls.${language}.status`]: detail.status,
			[`hls.${language}.updatedAt`]: new Date(),
		}

		if (detail.status === 'COMPLETE' && detail.outputGroupDetails) {
			const hlsOutput = detail.outputGroupDetails.find(
				(g) => g.type === 'HLS_GROUP'
			)

			// log deeply nested object
			console.log(
				'[MC handleSNSNotification] HLS output details:',
				JSON.stringify(detail.outputGroupDetails, null, 2)
			)

			if (
				hlsOutput &&
				hlsOutput.playlistFilePaths &&
				hlsOutput.playlistFilePaths.length > 0
			) {
				// Get the first playlist file path and remove the s3://bucket/ prefix
				const fullPath = hlsOutput.playlistFilePaths[0]
				const pathWithoutPrefix = fullPath.replace(`s3://${S3_BUCKET}/`, '')
				update[`hls.${language}.url`] = pathWithoutPrefix
				console.log(
					`[MC handleSNSNotification] Job complete, setting URL for ${language}:`,
					update[`hls.${language}.url`]
				)
			}
		}

		// Add error information if status is ERROR
		if (detail.status === 'ERROR') {
			update[`hls.${language}.error`] = {
				code: detail.errorCode,
				message: detail.errorMessage,
			}
		}

		console.log(update)

		await Session.findByIdAndUpdate(session._id, update)
		console.log(
			`[MC handleSNSNotification] Session updated with status for ${language}:`,
			detail.status
		)
	} catch (error) {
		console.error(
			'[MC handleSNSNotification] Error handling SNS notification:',
			error
		)
		throw error
	}
}

async function getJobStatus(jobId) {
	console.log('[MC getJobStatus] Fetching job status for:', jobId)
	try {
		const job = await mediaConvert.getJob({ Id: jobId })
		console.log('[MC getJobStatus] Retrieved job:', job.Job.Status)
		return {
			jobId: job.Job.Id,
			status: job.Job.Status,
			outputGroupDetails: job.Job.OutputGroupDetails,
			errorMessage: job.Job.ErrorMessage,
			errorCode: job.Job.ErrorCode,
			userMetadata: job.Job.UserMetadata,
		}
	} catch (error) {
		console.error('[MC getJobStatus] Error fetching job status:', error)
		throw error
	}
}

async function getHLSStatus(sessionId, language = 'en') {
	console.log(
		`[MC getHLSStatus] Getting HLS status for session ${sessionId}, language ${language}`
	)
	try {
		const session = await Session.findById(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		const hlsData = session.hls?.[language]
		if (!hlsData) {
			return {
				language,
				status: 'NOT_STARTED',
				message: `No HLS data found for language ${language}`,
			}
		}

		// If job is still in progress, get latest status from MediaConvert
		if (['SUBMITTED', 'PROGRESSING'].includes(hlsData.status)) {
			try {
				const jobStatus = await getJobStatus(hlsData.jobId)
				return {
					language,
					jobId: hlsData.jobId,
					status: jobStatus.status,
					outputPrefix: hlsData.outputPrefix,
					url: hlsData.url,
					error: hlsData.error,
					createdAt: hlsData.createdAt,
					updatedAt: hlsData.updatedAt,
					userMetadata: jobStatus.userMetadata,
				}
			} catch (error) {
				console.error(
					`[MC getHLSStatus] Error getting job status for ${language}:`,
					error
				)
				return {
					language,
					jobId: hlsData.jobId,
					status: hlsData.status,
					outputPrefix: hlsData.outputPrefix,
					url: hlsData.url,
					error: hlsData.error,
					createdAt: hlsData.createdAt,
					updatedAt: hlsData.updatedAt,
					message: 'Error fetching latest job status',
				}
			}
		}

		return {
			language,
			jobId: hlsData.jobId,
			status: hlsData.status,
			outputPrefix: hlsData.outputPrefix,
			url: hlsData.url,
			error: hlsData.error,
			createdAt: hlsData.createdAt,
			updatedAt: hlsData.updatedAt,
		}
	} catch (error) {
		console.error(`[MC getHLSStatus] Error getting HLS status:`, error)
		throw error
	}
}

async function getAllHLSStatuses(sessionId) {
	console.log(
		`[MC getAllHLSStatuses] Getting all HLS statuses for session ${sessionId}`
	)
	try {
		const session = await Session.findById(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		const result = {}

		// Get status for each language
		for (const language of ['en', 'es']) {
			try {
				result[language] = await getHLSStatus(sessionId, language)
			} catch (error) {
				console.error(
					`[MC getAllHLSStatuses] Error getting status for ${language}:`,
					error
				)
				result[language] = {
					language,
					status: 'ERROR',
					message: `Error fetching status for ${language}: ${error.message}`,
				}
			}
		}

		return result
	} catch (error) {
		console.error(
			`[MC getAllHLSStatuses] Error getting all HLS statuses:`,
			error
		)
		throw error
	}
}

async function deleteHLSFilesForLanguage(sessionId, language) {
	console.log(
		`[MC deleteHLSFilesForLanguage] Deleting HLS files for session ${sessionId}, language ${language}`
	)
	try {
		const session = await Session.findById(sessionId)
		if (!session) {
			throw new Error(`Session ${sessionId} not found`)
		}

		const hlsData = session.hls?.[language]
		if (!hlsData || !hlsData.outputPrefix) {
			console.log(
				`[MC deleteHLSFilesForLanguage] No HLS data found for language ${language}`
			)
			return
		}

		// Remove the s3://bucket/ prefix if present
		const prefix = hlsData.outputPrefix.replace(`s3://${S3_BUCKET}/`, '')
		await deleteHLSFiles(prefix)

		// Remove the HLS data from the database
		await Session.findByIdAndUpdate(sessionId, {
			$unset: { [`hls.${language}`]: 1 },
		})

		console.log(
			`[MC deleteHLSFilesForLanguage] Successfully deleted HLS files for language ${language}`
		)
	} catch (error) {
		console.error(
			`[MC deleteHLSFilesForLanguage] Error deleting HLS files for language ${language}:`,
			error
		)
		throw error
	}
}

module.exports = {
	generatePreSignedUploadUrl,
	deleteAwsObject,
	getJobUpdate,
	compressVideo,
	makeAssetPublic,
	bucket,
	startTranscription,
	getTranscriptionJobByName,
	createHLSJob,
	handleSNSNotification,
	getJobStatus,
	deleteHLSFiles,
	getHLSStatus,
	getAllHLSStatuses,
	deleteHLSFilesForLanguage,
}
