const express = require('express')
const router = express.Router()

const courses = require('./content/route_app_courses')
const sessions = require('./content/route_app_sessions')
const progresses = require('./content/route_app_progresses')
const badges = require('./content/route_app_badge')
const appVersion = require('./content/route_app_app-version')
const featureFlag = require('./content/route_app_feature-flag')

const auth = require('../../../middleware/auth')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const { Course } = require('../../../models/common/content/course_model')
const { Session } = require('../../../models/common/content/session_model')
const clientTypeMiddleware = require('../../../middleware/clientTypeMiddleware')
const FeatureFlagsModel = require('../../../models/common/content/features_model')
const { canAccessCourse } = require('./content/route_app_progresses')
const { RESTRICTED_PLATFORM } = require('../../../contant')
const sendResponse = require('../../../utils/sendResponse')
const HTTP = require('../../../constants/httpStatus')
const bible = require('./content/route_app_bible')
const readingPlan = require('./content/route_app_reading_plan')
const highlights = require('./content/route_app_highlights')

router.use('/courses', courses)
router.use('/sessions', sessions)
router.use('/progress', progresses)
router.use('/badges', badges)
router.use('/app-version', appVersion)
router.use('/feature', featureFlag)
router.use('/bible', bible)
router.use('/reading-plan', readingPlan)
router.use('/highlights', highlights)

router.get(
	'/structure',
	[clientTypeMiddleware, auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user._id.toString()
		const clientType = req.clientType

		const features = (await FeatureFlagsModel.findOne().lean()).data || {}

		const featureFlags =
			clientType === 'mobile'
				? {
						sessionContent:
							!!features?.mobile?.courseScreen?.courseContent?.enabled,
						canWatchIntro:
							!!features?.mobile?.courseScreen?.canWatchIntro?.enabled,
						canSeeTranscript:
							!!features?.mobile?.sessionScreen?.sessionInfo?.canSeeTranscript
								?.enabled,
						canSeeResources:
							!!features?.mobile?.sessionScreen?.sessionInfo?.resources
								?.enabled,
						canSeeAboutSession:
							!!features?.mobile?.sessionScreen?.sessionInfo?.aboutSession
								?.enabled,
						canTakeQuiz:
							!!features?.mobile?.sessionScreen?.canTakeQuiz?.enabled,

						canWatchSessionVideo:
							!!features?.mobile?.sessionScreen?.videoPlayer?.enabled,
					}
				: {
						sessionContent:
							!!features?.webApp?.coursePage?.courseContent?.enabled,
						canWatchIntro:
							!!features?.webApp?.coursePage?.canWatchIntro?.enabled,
						canSeeTranscript:
							!!features?.webApp?.sessionPage?.canSeeTranscript?.enabled,
						canSeeResources:
							!!features?.webApp?.sessionPage?.sessionInfo?.resources?.enabled,
						canSeeAboutSession:
							!!features?.webApp?.sessionPage?.sessionInfo?.aboutSession
								?.enabled,
						canTakeQuiz: !!features?.webApp?.sessionPage?.canTakeQuiz?.enabled,
						canWatchSessionVideo:
							!!features?.webApp?.sessionPage?.videoPlayer?.enabled,
					}

		const isIOSMobile =
			req.clientType === 'mobile' &&
			req.headers['user-agent']
				?.toString()
				.toLocaleLowerCase()
				.includes(RESTRICTED_PLATFORM)

		// Fetch all required data in a single query with proper population
		const courses = await Course.find({ isDraft: false })
			.sort({ index: 'ascending' })
			.populate({
				path: 'modules',
				populate: {
					path: 'sessions',
					model: 'Session',
					options: { sort: { index: 'ascending' } },
				},
			})
			.populate('coursePurchasedUsers', '_id')
			.lean()

		const coursesArray = await Promise.all(
			courses.map(async (course) => {
				// Check if the current user has purchased this course
				const isPurchased = course.coursePurchasedUsers?.some(
					(user) => user._id.toString() === userId
				)

				// Remove coursePurchasedUsers field from the course object
				delete course.coursePurchasedUsers

				// Organize sessions by module order: Module 1 sessions, then Module 2 sessions, etc.
				let allSessions = []
				if (course.modules && course.modules.length > 0) {
					// Sort modules by index to ensure correct order
					const sortedModules = course.modules.sort((a, b) => a.index - b.index)

					// Collect all sessions from modules in order
					sortedModules.forEach((module) => {
						if (module.sessions && module.sessions.length > 0) {
							// Sessions are already sorted by index within each module
							allSessions = allSessions.concat(module.sessions)
						}
					})
				} else {
					// Non-modular course: fetch sessions directly by courseId
					const directSessions = await Session.find({
						courseId: course._id.toString(),
					})
						.sort({ index: 'ascending' })
						.lean()
					allSessions = directSessions
				}

				if (!featureFlags.canWatchIntro) {
					delete course.introVideo
					delete course.IntroVideoTranscribe
				}

				if (!featureFlags.sessionContent) {
					return {
						...course,
						isPurchased,
						modules: [],
						sessions: [],
						options: {
							quizCount: 0,
							totalDuration: 0,
							lessons: 0,
						},
					}
				}

				allSessions = allSessions.map((session) => {
					if (!featureFlags.canSeeTranscript) {
						delete session.transcribe
					}

					if (!featureFlags.canSeeResources) {
						delete session.attachment
					}

					if (!featureFlags.canSeeAboutSession) {
						delete session.description
					}

					if (!featureFlags.canTakeQuiz) {
						delete session.quiz
					}

					if (!featureFlags.canWatchSessionVideo) {
						delete session.video
					}

					return session
				})

				if (course.isModular && course.modules.length) {
					// Sessions are already populated in modules, no need to map IDs
					// Just ensure modules are sorted by index
					course.modules = course.modules.sort((a, b) => a.index - b.index)
				}

				// Compute course statistics
				const { quizCount, totalDuration } = calculateCourseStats(allSessions)

				// Check if user can access this course based on prerequisites
				const accessCheck = await canAccessCourse(course._id.toString(), userId)

				return {
					...course,
					isPurchased,
					canAccess: accessCheck.canAccess,
					accessReason: accessCheck.reason,
					requiredCourse: accessCheck.requiredCourse,
					modules: course.isModular ? course.modules : [],
					sessions: allSessions,
					options: {
						quizCount,
						totalDuration,
						lessons: allSessions.length,
					},
				}
			})
		)

		// For iOS users, filter to only show purchased courses
		const filteredCourses = isIOSMobile
			? coursesArray.filter((course) => course.isPurchased)
			: coursesArray

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Course structure retrieved successfully',
			data: filteredCourses,
		})
	})
)

function calculateCourseStats(sessions = []) {
	let totalDuration = { en: 0, es: 0 },
		quizCount = 0

	if (sessions?.length > 0) {
		sessions.forEach((session) => {
			if (session.duration) {
				if (session.duration.en) totalDuration.en += session.duration.en
				if (session.duration.es) totalDuration.es += session.duration.es
			}
			if (session.quiz) quizCount += 1
		})

		// Format totalDuration for both languages
		totalDuration.en = formatDuration(totalDuration.en)
		totalDuration.es = formatDuration(totalDuration.es)
	}

	return { totalDuration, quizCount }
}

// Helper function to format duration
function formatDuration(totalSeconds, removeSec = false) {
	// Calculate hours, minutes, and remaining seconds
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60

	// Build the duration string with better UX
	const parts = []

	if (hours > 0) {
		parts.push(`${hours}h`)
	}
	if (minutes > 0) {
		parts.push(`${minutes}m`)
	}
	if (!removeSec && seconds > 0) {
		parts.push(`${seconds}s`)
	}

	// Join with spaces for better readability
	return parts.join(' ')
}

module.exports = router
