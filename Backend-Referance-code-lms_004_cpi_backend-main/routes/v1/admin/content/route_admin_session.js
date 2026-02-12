const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')
const _ = require('lodash')
const superAdmin = require('../../../../middleware/superAdmin')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const { Session } = require('../../../../models/common/content/session_model')
const {
	deleteAwsObject,
	startTranscription,
	deleteHLSFiles,
} = require('../../../../services/aws')
const { Course } = require('../../../../models/common/content/course_model')
const { Module } = require('../../../../models/common/content/module_model')
const { default: mongoose } = require('mongoose')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

// Helper function to clean HLS paths (remove S3 prefixes)
const cleanHlsPaths = (hlsData) => {
	if (!hlsData || typeof hlsData !== 'object') return hlsData

	const cleaned = JSON.parse(JSON.stringify(hlsData))
	const bucketName = process.env.AWS_BUCKET_NAME || 'lms-004-pastor-university'
	const s3Prefix = `s3://${bucketName}/`

	// Clean outputPrefix if it exists
	if (cleaned.outputPrefix && typeof cleaned.outputPrefix === 'string') {
		cleaned.outputPrefix = cleaned.outputPrefix.replace(s3Prefix, '')
	}

	// Clean url if it exists
	if (cleaned.url && typeof cleaned.url === 'string') {
		cleaned.url = cleaned.url.replace(s3Prefix, '')
	}

	return cleaned
}

router.post(
	'/',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const {
			sessionId,
			name,
			description,
			video,
			attachment,
			duration,
			courseId,
			moduleId,
			hls,
		} = req.body

		if (!courseId)
			return next(new ErrorHandler('Course id is required', HTTP.BAD_REQUEST))

		// Verify course exists
		const courses = await Course.aggregate([
			{ $match: { _id: new mongoose.Types.ObjectId(courseId) } },
		])
		if (!courses.length)
			return next(new ErrorHandler('Course not found', HTTP.BAD_REQUEST))
		const course = courses[0]

		if (sessionId) {
			// -------- UPDATE BRANCH --------
			const sessions = await Session.aggregate([
				{ $match: { _id: new mongoose.Types.ObjectId(sessionId) } },
			])
			const session = sessions[0]
			if (!session)
				return next(new ErrorHandler('Session not found', HTTP.NOT_FOUND))

			const setFields = {}
			const unsetFields = {}

			// Handle multilingual video fields
			;['en', 'es'].forEach((lang) => {
				if (req.body.hasOwnProperty('video')) {
					const newVal = video?.[lang]
					const oldVal = session.video?.[lang]
					if ((newVal === null || newVal === '') && oldVal) {
						// remove old video and its HLS files
						if (typeof oldVal === 'object') {
							Object.values(oldVal).forEach((key) => deleteAwsObject(key))
						} else {
							deleteAwsObject(oldVal)
						}

						// Delete HLS files for this language if they exist
						if (session.hls?.[lang]) {
							console.log(
								`[Session Update] Deleting HLS files for language ${lang}`
							)
							const hlsData = session.hls[lang]
							if (hlsData.outputPrefix) {
								// Extract prefix from s3://bucket/prefix format
								const prefix = hlsData.outputPrefix.replace(
									`s3://${
										process.env.AWS_BUCKET_NAME || 'lms-004-pastor-university'
									}/`,
									''
								)
								deleteHLSFiles(prefix).catch((err) => {
									console.error(
										`[Session Update] Error deleting HLS files for ${lang}:`,
										err
									)
								})
							}
						}

						unsetFields[`video.${lang}`] = ''
						unsetFields[`hls.${lang}`] = '' // Also remove HLS data from DB
					} else if (newVal) {
						if (oldVal) {
							// Delete old video file
							if (typeof oldVal === 'object') {
								Object.values(oldVal).forEach((key) => deleteAwsObject(key))
							} else {
								deleteAwsObject(oldVal)
							}

							// Delete old HLS files for this language if they exist - BUT ONLY IF NOT PROVIDING NEW HLS DATA
							if (session.hls?.[lang] && !req.body.hls?.[lang]) {
								console.log(
									`[Session Update] Deleting old HLS files for language ${lang}`
								)
								const hlsData = session.hls[lang]
								if (hlsData.outputPrefix) {
									const prefix = hlsData.outputPrefix.replace(
										`s3://${
											process.env.AWS_BUCKET_NAME || 'lms-004-pastor-university'
										}/`,
										''
									)
									deleteHLSFiles(prefix).catch((err) => {
										console.error(
											`[Session Update] Error deleting old HLS files for ${lang}:`,
											err
										)
									})
								}
							}
						}
						setFields[`video.${lang}`] = newVal
						// Only remove old HLS data if we're not providing new HLS data
						if (!req.body.hls?.[lang]) {
							unsetFields[`hls.${lang}`] = '' // Remove old HLS data since new video needs new HLS conversion
						}
					}
				}
			})

			// Handle HLS data
			if (req.body.hasOwnProperty('hls')) {
				const existingHls = session.hls || {}
				console.log('[Session Update] Processing HLS data:', {
					existing: existingHls,
					incoming: req.body.hls,
				})
				;['en', 'es'].forEach((lang) => {
					if (req.body.hls?.[lang]) {
						// Clean HLS paths before storing
						const cleanedHlsData = cleanHlsPaths(req.body.hls[lang])
						setFields[`hls.${lang}`] = cleanedHlsData
						console.log(
							`[Session Update] Setting cleaned HLS data for ${lang}:`,
							cleanedHlsData
						)
					}
				})
			}

			// Handle attachment
			if (req.body.hasOwnProperty('attachment')) {
				const newAttach = attachment
				const oldAttach = session.attachment
				if ((newAttach === null || newAttach === '') && oldAttach?.key) {
					deleteAwsObject(oldAttach.key)
					unsetFields.attachment = ''
				} else if (newAttach) {
					if (oldAttach?.key) deleteAwsObject(oldAttach.key)
					setFields.attachment = newAttach
				}
			}

			// Handle scalar localized name and description
			;['name', 'description', 'duration'].forEach((field) => {
				if (
					req.body.hasOwnProperty(field) &&
					typeof req.body[field] === 'object'
				) {
					;['en', 'es'].forEach((lang) => {
						const val = req.body[field]?.[lang]
						if (val !== undefined) setFields[`${field}.${lang}`] = val
					})
				}
			})

			// Build update document
			const updateDoc = {}
			if (Object.keys(setFields).length) updateDoc.$set = setFields
			if (Object.keys(unsetFields).length) updateDoc.$unset = unsetFields

			console.log(
				'[Session Update] Final update document:',
				JSON.stringify(updateDoc, null, 2)
			)

			const updatedSession = await Session.findOneAndUpdate(
				{ _id: sessionId },
				updateDoc,
				{ new: true }
			)

			console.log(
				'[Session Update] Session updated successfully, HLS data:',
				updatedSession.hls
			)

			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: updatedSession,
				message: 'Session updated successfully',
			})
		} else {
			// -------- CREATE BRANCH --------
			// Validate required English fields
			if (!name?.en)
				return next(
					new ErrorHandler(
						'English name (name.en) is required',
						HTTP.BAD_REQUEST
					)
				)
			if (!description?.en)
				return next(
					new ErrorHandler(
						'English description (description.en) is required',
						HTTP.BAD_REQUEST
					)
				)

			let session
			let sessionsCount

			if (course.isModular) {
				// Validate module
				const module = await Module.findById(moduleId)
				if (!module)
					return next(new ErrorHandler('Invalid Module', HTTP.BAD_REQUEST))
				if (module.course.toString() !== courseId)
					return next(
						new ErrorHandler(
							'Module does not belong to the course',
							HTTP.BAD_REQUEST
						)
					)

				sessionsCount = await Session.countDocuments({ moduleId })
				// Clean HLS data before creating session
				const cleanedHls = hls
					? {
							en: hls.en ? cleanHlsPaths(hls.en) : undefined,
							es: hls.es ? cleanHlsPaths(hls.es) : undefined,
						}
					: undefined

				session = await Session.create({
					courseId,
					moduleId,
					index: sessionsCount + 1,
					name: { en: name.en, es: name.es || '' },
					description: { en: description.en, es: description.es || '' },
					video: { en: video?.en || '', es: video?.es || '' },
					duration: { en: duration?.en || 0, es: duration?.es || 0 },
					attachment: attachment || undefined,
					hls: cleanedHls,
				})

				module.sessions.push(session._id)
				await module.save()
			} else {
				sessionsCount = await Session.countDocuments({ courseId })
				// Clean HLS data before creating session
				const cleanedHls = hls
					? {
							en: hls.en ? cleanHlsPaths(hls.en) : undefined,
							es: hls.es ? cleanHlsPaths(hls.es) : undefined,
						}
					: undefined

				session = await Session.create({
					courseId,
					index: sessionsCount + 1,
					name: { en: name.en, es: name.es || '' },
					description: { en: description.en, es: description.es || '' },
					video: { en: video?.en || '', es: video?.es || '' },
					duration: { en: duration?.en || 0, es: duration?.es || 0 },
					attachment: attachment || undefined,
					hls: cleanedHls,
				})
			}

			// Associate session with course
			await Course.findByIdAndUpdate(courseId, {
				$push: { sessions: session._id },
			})

			return sendResponse({
				res,
				status: true,
				code: HTTP.CREATED,
				data: session,
				message: 'Session created successfully',
			})
		}
	})
)

router.put(
	'/updateSessionOrder',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const {
			courseId,
			fromModuleId,
			toModuleId,
			fromSessionOrder,
			toSessionOrder,
			movedSessionId,
		} = req.body

		if (!courseId) {
			return next(
				new ErrorHandler('Please provide CourseID!', HTTP.BAD_REQUEST)
			)
		}

		if (
			!fromSessionOrder ||
			!Array.isArray(fromSessionOrder) ||
			(toModuleId && (!toSessionOrder || !Array.isArray(toSessionOrder)))
		) {
			return next(
				new ErrorHandler('Please provide valid SessionOrder!', HTTP.BAD_REQUEST)
			)
		}

		// Determine if the course is modular
		const course = await Course.findById(courseId)
		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
		}

		const isModular = course.isModular

		if (isModular) {
			if (!fromModuleId) {
				return next(
					new ErrorHandler(
						'From Module ID is required for modular courses',
						HTTP.BAD_REQUEST
					)
				)
			}

			// Update session order in the from module
			for (let i = 0; i < fromSessionOrder.length; i++) {
				const sessionId = fromSessionOrder[i]
				let filter = {
					_id: sessionId,
					courseId: courseId,
					moduleId: fromModuleId,
				}
				await Session.updateOne(filter, { index: i + 1 })
			}

			// Update session order in the to module if it's different
			if (toModuleId && fromModuleId !== toModuleId) {
				for (let i = 0; i < toSessionOrder.length; i++) {
					const sessionId = toSessionOrder[i]
					let filter = {
						_id: sessionId,
						courseId: courseId,
						moduleId: toModuleId,
					}
					await Session.updateOne(filter, { index: i + 1 })
				}

				// Move session from one module to another
				await Module.updateOne(
					{ _id: fromModuleId },
					{ $pull: { sessions: movedSessionId } }
				)
				await Module.updateOne(
					{ _id: toModuleId },
					{ $push: { sessions: movedSessionId } }
				)
				await Session.updateOne(
					{ _id: movedSessionId },
					{ moduleId: toModuleId }
				)
			}
		} else {
			// Update session order for non-modular courses
			for (let i = 0; i < fromSessionOrder.length; i++) {
				const sessionId = fromSessionOrder[i]
				let filter = { _id: sessionId, courseId: courseId }
				await Session.updateOne(filter, { index: i + 1 })
			}
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Session order updated successfully',
		})
	})
)

router.put(
	'/moveUp',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		let sessionId = req.body.sessionId
		if (!sessionId)
			return next(
				new ErrorHandler('Please provide SessionID!', HTTP.BAD_REQUEST)
			)

		let session = await Session.findById(sessionId)
		let sessions = await Session.find({ courseId: session.courseId }).sort(
			'index'
		)
		sessions.forEach((item, index) => (sessions[index].index = index + 1))
		console.log('1', sessions)
		session = sessions.find((s) => s._id.toString() === sessionId)
		console.log(session)
		if (session.index === 1)
			return next(
				new ErrorHandler('Session is already at the top', HTTP.BAD_REQUEST)
			)
		// Swap the session with the one above it
		let indexAbove = session.index - 1
		sessions.forEach((item, index) => {
			if (index + 1 === indexAbove) {
				sessions[index].index = indexAbove + 1
			}
			if (index + 1 === indexAbove + 1) {
				sessions[index].index = indexAbove
			}
		})
		await Session.bulkSave(sessions)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Session moved up successfully',
		})
	})
)

router.put(
	'/moveDown',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		let sessionId = req.body.sessionId
		if (!sessionId)
			return next(
				new ErrorHandler('Please provide SessionID!', HTTP.BAD_REQUEST)
			)

		let session = await Session.findById(sessionId)
		let sessions = await Session.find({ courseId: session.courseId }).sort(
			'index'
		)
		sessions.forEach((item, index) => (sessions[index].index = index + 1))
		session = sessions.find((s) => s._id.toString() === sessionId)
		if (session.index === session.length)
			return next(
				new ErrorHandler('Session is already at the Bottom', HTTP.BAD_REQUEST)
			)
		// Swap the session with the one above it
		let indexBelow = session.index + 1
		sessions.forEach((item, index) => {
			if (index + 1 === indexBelow - 1) {
				sessions[index].index = indexBelow
			}
			if (index + 1 === indexBelow) {
				sessions[index].index = indexBelow - 1
			}
		})

		console.log('done', sessions)
		await Session.bulkSave(sessions)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Session moved down successfully',
		})
	})
)

router.put(
	'/updateQuiz',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { quiz, courseId, moduleId, sessionId } = req.body

		if (!quiz || !courseId) {
			return next(
				new ErrorHandler('Quiz and CourseId are required', HTTP.BAD_REQUEST)
			)
		}

		const course = await Course.findById(courseId).lean()

		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.BAD_REQUEST))
		}

		let session
		if (course.isModular) {
			if (!moduleId || !sessionId) {
				return next(
					new ErrorHandler(
						'ModuleId and SessionId are required for modular courses',
						HTTP.BAD_REQUEST
					)
				)
			}

			session = await Session.findOneAndUpdate(
				{
					_id: sessionId,
					courseId: courseId,
					moduleId: moduleId,
				},
				{ quiz },
				{ new: true }
			)

			if (!session) {
				return next(
					new ErrorHandler(
						'Session not found or does not belong to the provided module and course',
						HTTP.NOT_FOUND
					)
				)
			}
		} else {
			if (!sessionId) {
				return next(
					new ErrorHandler(
						'SessionId is required for non-modular courses',
						HTTP.BAD_REQUEST
					)
				)
			}

			session = await Session.findOneAndUpdate(
				{
					_id: sessionId,
					courseId: courseId,
				},
				{ quiz },
				{ new: true }
			)

			if (!session) {
				return next(
					new ErrorHandler(
						'Session not found or does not belong to the provided course',
						HTTP.NOT_FOUND
					)
				)
			}
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: session,
			message: 'Quiz updated successfully',
		})
	})
)

//edit a session
router.put(
	'/:id',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		let obj = _.pick(req.body, [
			'name',
			'image',
			'description',
			'video',
			'audio',
			'attachment',
			'duration',
			'quiz',
			'courseId',
			'index',
		])

		const session = await Session.findByIdAndUpdate(req.params.id, obj)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Session updated successfully',
		})
	})
)

//get sessions
router.get(
	'/',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		if (!req.query.courseId)
			return next(new ErrorHandler('CourseId not found', HTTP.BAD_REQUEST))

		const sessions = await Session.find({ courseId: req.query.courseId }).sort(
			'index'
		)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: sessions,
			message: 'Sessions fetched successfully',
		})
	})
)

//get a session
router.get(
	'/getSession',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { sessionId, moduleId, courseId } = req.query

		let session
		if (courseId) {
			const course = await Course.findById(courseId)
			if (!course) {
				return next(new ErrorHandler('Course not found.', HTTP.NOT_FOUND))
			}

			if (course.isModular) {
				if (!moduleId) {
					return next(
						new ErrorHandler(
							'Module ID is required for modular courses.',
							HTTP.BAD_REQUEST
						)
					)
				}
				const module = await Module.findById(moduleId)
				if (!module) {
					return next(new ErrorHandler('Module not found.', HTTP.NOT_FOUND))
				}
				session = await Session.findOne({ _id: sessionId, moduleId })
				if (!session) {
					return next(
						new ErrorHandler(
							'Session not found in the specified module.',
							HTTP.NOT_FOUND
						)
					)
				}
			} else {
				session = await Session.findOne({ _id: sessionId, courseId })
				if (!session) {
					return next(
						new ErrorHandler(
							'Session not found in the specified course.',
							HTTP.NOT_FOUND
						)
					)
				}
			}
		} else {
			return next(new ErrorHandler('Course ID is required.', HTTP.BAD_REQUEST))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: session,
			message: 'Session fetched successfully',
		})
	})
)

//delete a session
router.delete(
	'/deleteSessionById',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { sessionId, moduleId, courseId } = req.query

		if (!sessionId)
			return next(new ErrorHandler('Session id is required', HTTP.BAD_REQUEST))
		if (!courseId)
			return next(new ErrorHandler('Course id is required', HTTP.BAD_REQUEST))

		const course = await Course.findById(courseId)
		if (!course)
			return next(new ErrorHandler('Course not found', HTTP.BAD_REQUEST))

		let query = { _id: sessionId, courseId: courseId }

		if (course.isModular) {
			if (!moduleId) {
				return next(
					new ErrorHandler(
						'Module id is required for modular courses',
						HTTP.BAD_REQUEST
					)
				)
			}

			const module = await Module.findOne({ _id: moduleId, course: courseId })
			if (!module) {
				return next(
					new ErrorHandler(
						'Module not found or does not belong to the specified course',
						HTTP.BAD_REQUEST
					)
				)
			}

			query.moduleId = moduleId
		}

		const session = await Session.findOne(query)
		if (!session) {
			return next(
				new ErrorHandler(
					'Session not found or does not belong to the specified course/module',
					HTTP.BAD_REQUEST
				)
			)
		}

		await session.deleteOne()

		await Course.updateOne(
			{ _id: courseId },
			{ $pull: { sessions: sessionId } }
		)

		if (course.isModular) {
			await Module.updateOne(
				{ _id: moduleId },
				{ $pull: { sessions: sessionId } }
			)
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Session and its AWS objects deleted successfully',
		})
	})
)

router.patch(
	'/updateSessionLessons',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { language, video, sessionId, duration } = req.body

		const user = req.user

		if (!user.isDev) {
			return next(new ErrorHandler('Unauthorized', HTTP.FORBIDDEN))
		}

		if (!language || !sessionId || typeof video !== 'object') {
			return next(new ErrorHandler('Invalid payload.', HTTP.BAD_REQUEST))
		}

		// Get the session's current video and duration
		const sessionAgg = await Session.aggregate([
			{ $match: { _id: new mongoose.Types.ObjectId(sessionId) } },
			{ $project: { video: 1, duration: 1 } },
		])

		if (!sessionAgg.length) {
			return next(new ErrorHandler('Session not found.', HTTP.NOT_FOUND))
		}

		const sessionData = sessionAgg[0]

		const currentVideos =
			(sessionData.video && sessionData.video[language]) || {}
		const currentDuration =
			(sessionData.duration && sessionData.duration[language]) || null

		const updatedFields = {}

		// Handle video updates
		for (const quality in video) {
			if (video.hasOwnProperty(quality)) {
				const newValue = video[quality]

				if (newValue) {
					const oldValue = currentVideos[quality]

					if (oldValue && oldValue !== newValue) {
						await deleteAwsObject(oldValue)
					}

					updatedFields[quality] = newValue
				}
			}
		}

		const updatePayload = {}

		// If any video field was updated, include it
		if (Object.keys(updatedFields).length > 0) {
			updatePayload[`video.${language}`] = {
				...currentVideos,
				...updatedFields,
			}
		}

		// Handle duration update (only if duration is provided and changed)
		if (
			duration !== undefined &&
			duration !== null &&
			duration !== currentDuration
		) {
			updatePayload[`duration.${language}`] = duration
		}

		if (Object.keys(updatePayload).length === 0) {
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'No changes detected.',
			})
		}

		const updatedSession = await Session.findByIdAndUpdate(
			sessionId,
			{ $set: updatePayload },
			{ new: true }
		)

		const updated1080pKey =
			updatedSession.video &&
			updatedSession.video[language] &&
			updatedSession.video[language]['1080p']

		if (updated1080pKey && updated1080pKey !== currentVideos['1080p']) {
			const uniqueJobId = uuidv4()
			startTranscription(
				updated1080pKey,
				sessionId,
				null,
				uniqueJobId,
				language
			).then(() => {
				console.log('Transcription started for updated video.', {
					updated1080pKey,
					sessionId,
					uniqueJobId,
					language,
				})
			})
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				video: updatedSession.video,
				duration: updatedSession.duration,
			},
			message: 'Session updated successfully.',
		})
	})
)

module.exports = router
