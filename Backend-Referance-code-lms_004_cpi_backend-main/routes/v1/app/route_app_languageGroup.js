const express = require('express')
const router = express.Router()

const auth = require('../../../middleware/auth')
const subAdminOrAdmin = require('../../../middleware/subAdminOrAdmin')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')

const { User } = require('../../../models/app/user_model')
const {
	UserProgress,
} = require('../../../models/app/content/user_progress_model')
const { Course } = require('../../../models/common/content/course_model')
const { Session } = require('../../../models/common/content/session_model')
const clientTypeMiddleware = require('../../../middleware/clientTypeMiddleware')
const featureFlagMiddleware = require('../../../middleware/featureFlag')
const FeatureFlagsModel = require('../../../models/common/content/features_model')

router.get(
	'/members',
	[auth, subAdminOrAdmin],
	catchAsyncError(async (req, res, next) => {
		const members = await User.find()
		if (!members?.length > 0) {
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: 'No members found',
				data: [],
			})
		}
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Members retrieved successfully',
			data: [],
		})
	})
)

router.get(
	'/getRequestList',
	[auth, subAdminOrAdmin],
	catchAsyncError(async (req, res, next) => {
		let users = await User.find()
			.select('-password')
			.sort({ firstName: 1, lastName: 1 })
			.collation({ locale: 'en', strength: 1 })
			.lean()

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Request list retrieved successfully',
			data: users,
		})
	})
)

router.get(
	'/progressAndMembers',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'groupPage',
		mobilePath: 'myGroupScreen',
	}),
	[auth, subAdminOrAdmin],
	catchAsyncError(async (req, res, next) => {
		const isWeb = req.clientType === 'web'
		const isMobile = req.clientType === 'mobile'

		const featureFlags = await FeatureFlagsModel.findOne().lean()

		if (!featureFlags) {
			return next(new ErrorHandler('Feature flags not found', HTTP.BAD_REQUEST))
		}

		const features = featureFlags.data || {}

		const activeMemberEnabled = isWeb
			? (features?.webApp?.groupPage?.allMemberList?.enabled ?? false)
			: (features?.mobile?.myGroupScreen?.members?.activeMember?.enabled ??
				false)

		const overviewEnabled = isWeb
			? (features?.webApp?.groupPage?.courseOverview?.enabled ?? false)
			: (features?.mobile?.myGroupScreen?.groupOverview?.enabled ?? false)

		const response = {
			members: [],
			progress: undefined,
			completedPercentage: 0,
		}

		let { strt, semCount } = await getCourseStructure()

		const members = await User.find({
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})
			.select('-password')
			.sort({ firstName: 1, lastName: 1 })
			.collation({ locale: 'en', strength: 1 })
			.lean()

		if (!members || members.length === 0) {
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: 'No members found',
				data: response,
			})
		}

		const enabledUsers = members.map((member) => member._id.toString())

		const progresses = await UserProgress.find({
			userId: { $in: enabledUsers },
		}).lean()

		if (activeMemberEnabled) {
			const allProgresses = await UserProgress.find().lean()

			const memberProgressMap = new Map()
			allProgresses.forEach((progress) => {
				memberProgressMap.set(
					progress.userId.toString(),
					progress.progress.length
				)
			})

			for (const member of members) {
				const completedProgress =
					memberProgressMap.get(member._id.toString()) || 0
				member.completedPer =
					semCount > 0 ? Math.floor((completedProgress / semCount) * 100) : 0
			}

			response.members = members
		}

		if (!overviewEnabled) {
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: 'Progress and members retrieved successfully',
				data: response,
			})
		}

		if (strt.length === 0) {
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: 'No course structure found',
				data: response,
			})
		}

		let totalSessions = 0
		let totalSessionsCompleted = 0

		progresses.forEach((progress) => {
			totalSessionsCompleted =
				totalSessionsCompleted +
				(progress.progress ? progress.progress.length : 0)
		})

		strt.forEach((course, i) => {
			if (course.sessions?.length > 0) {
				totalSessions += course.sessions.length
				let completedCount = 0
				let onCourse = 0

				progresses.forEach((progress) => {
					let completed = true
					course.sessions.forEach((session) => {
						const exists = progress.progress.some(
							(completedSession) =>
								session._id.toString() === completedSession._id.toString()
						)
						if (!exists) completed = false
					})
					if (progress.currentCourseId === course._id.toString()) onCourse++
					if (completed) completedCount++
				})

				strt[i].options.completedPercentage = Math.floor(
					(completedCount / members.length) * 100
				)
				strt[i].options.membersCompleted = completedCount
				strt[i].options.membersOnCourse = onCourse
			}
		})

		response.progress = strt
		response.completedPercentage = Math.round(
			(totalSessionsCompleted / (totalSessions * members.length)) * 100
		)

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Progress and members retrieved successfully',
			data: response,
		})
	})
)

router.get(
	'/:id',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const Language = require('../../../models/common/language_model')
		const language = await Language.findById(req.params.id)
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Language retrieved successfully',
			data: language,
		})
	})
)

async function getCourseStructure() {
	const courses = await Course.find({ isDraft: false })
		.sort({ index: 1 })
		.lean()
	const sessions = await Session.find().sort({ index: 1 }).lean()

	if (courses.length === 0) return { strt: [], semCount: 0 }

	let semCount = 0

	const strt = courses.map((course) => {
		const courseSessions = sessions.filter(
			(session) => session.courseId.toString() === course._id.toString()
		)
		semCount += courseSessions.length

		return {
			...course,
			sessions: courseSessions.map((session) => ({ _id: session._id })),
			options: {
				lessons: courseSessions.length,
			},
		}
	})

	return { strt, semCount }
}

module.exports = router
