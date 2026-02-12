const express = require('express')

const router = express.Router()
const superAdmin = require('../../../../middleware/superAdmin')
const auth = require('../../../../middleware/auth')
const {
	User,
	validateUser: UserValidation,
} = require('../../../../models/app/user_model')
const _ = require('lodash')
const {
	UserProgress,
} = require('../../../../models/app/content/user_progress_model')
const { Course } = require('../../../../models/common/content/course_model')
const { Session } = require('../../../../models/common/content/session_model')
const {
	getUserStreaksDates,
} = require('../../../../services/userActionTracking')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

// Get users with pending request
router.get(
	'/getMembers',
	[superAdmin],
	catchAsyncError(async (req, res) => {
		const query = {
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		}

		if (req.query.text) {
			const keywords = req.query.text
				.split(' ')
				.map((keyword) => new RegExp(keyword, 'i'))
			query.$or = [
				{ name: { $in: keywords } },
				{ email: { $in: keywords } },
				{ phone: { $in: keywords } },
			]
		}

		if (req.query.isUser !== undefined)
			query.isUser = req.query.isUser === 'true'
		if (req.query.isAdmin !== undefined)
			query.isAdmin = req.query.isAdmin === 'true'

		// Handle isEnabled filter, treating absent field as false
		if (req.query.isEnabled !== undefined) {
			const isEnabledValue = req.query.isEnabled === 'true'
			query.$or = query.$or || []
			query.$or.push({ isEnabled: isEnabledValue })
			if (!isEnabledValue) query.$or.push({ isEnabled: { $exists: false } })
		}
		const sortField = req.query.sortField || 'createdAt'
		const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
		const sort = { [sortField]: sortOrder }

		let memberArr = await User.find(query).sort(sort)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: memberArr,
			message: 'Members fetched successfully',
		})
	})
)

//get users
router.get(
	'/',
	[superAdmin],
	catchAsyncError(async (req, res) => {
		let searchTerm
		let searchTermArr = []
		let filterArr = [],
			filter = {}

		if (req.query.term) {
			searchTerm = req.query.term
			searchTermArr = searchTerm.split(' ')
			searchTermArr.forEach((term) => {
				filterArr.push({
					$or: [
						{ name: { $regex: term, $options: 'i' } },
						{ email: { $regex: term, $options: 'i' } },
						{ phone: { $regex: term, $options: 'i' } },
					],
				})
			})

			filter = {
				$and: filterArr,
			}
		}

		filter.isUser = true

		let memberArr = await User.find(filter, [
			'_id',
			'name',
			'email',
			'phone',
			'isEnabled',
		])

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: memberArr,
			message: 'Users fetched successfully',
		})
	})
)

//get user
router.get(
	'/:id',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const user = await User.findById(req.params.id).lean()

		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: user,
			message: 'User fetched successfully',
		})
	})
)

// get user details and it's progress
router.get(
	'/getMemberDetails/:id',
	catchAsyncError(async (req, res, next) => {
		const userId = req.params.id

		if (!userId) {
			return next(new ErrorHandler('User id required', HTTP.BAD_REQUEST))
		}

		const user = await User.findById(userId)
			.select('-password -resetToken')
			.lean()

		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		const progressData = await UserProgress.findOne({ userId }).lean()
		const courses = await Course.find({ isDraft: false })
			.select(
				'_id nameES name index image description descriptionES isModular amount presentedBy'
			)
			.sort({ index: 1 })
			.lean()

		// Initialize progress as empty array if user has no progress data
		const progress = progressData?.progress || []

		// Enrich course data with progress
		let enrichedCourses = await Promise.all(
			courses.map(async (course) => {
				// Fetch sessions for the course
				const courseSessions = await Session.find({
					courseId: course._id.toString(),
				})
					.select(
						'_id nameES name quiz description descriptionES courseId index moduleId'
					)
					.sort({ index: 1 })
					.lean()

				let completedCount = 0

				// Process the sessions
				const processedSessions = courseSessions.map((session) => {
					const completedSession = progress.find(
						(completed) => session._id.toString() === completed._id.toString()
					)

					if (completedSession) {
						session.completed = true
						session.quizAttempt = completedSession.quizAttempt

						if (session.quizAttempt && session.quiz?.questions?.length > 0) {
							let answerCount = 0

							session.quiz.questions.forEach((question) => {
								session.quizAttempt.forEach((attempt) => {
									if (
										attempt.questionId.toString() === question._id.toString() &&
										attempt.selectedId.toString() ===
											question.correctOptionId.toString()
									) {
										answerCount += 1
									}
								})
							})

							session.quizAttemptScore = `${answerCount}/${session.quiz.questions.length}`
						}
					}

					if (session.completed) completedCount += 1
					return session
				})

				// Calculate completion percentage
				course.sessions = processedSessions
				course.options = {
					...course.options,
					completedPercentage:
						processedSessions.length > 0
							? Math.floor((completedCount / processedSessions.length) * 100)
							: 0,
				}

				return course
			})
		)

		enrichedCourses = enrichedCourses
			.filter(
				(course) =>
					course?.sessions?.length > 0 &&
					course?.options?.completedPercentage !== undefined &&
					course?.options?.completedPercentage !== null &&
					course?.options?.completedPercentage > 0
			)
			.sort(
				(course1, course2) =>
					course2.options.completedPercentage -
					course1.options.completedPercentage
			)

		let streaks = await getUserStreaksDates(user._id.toString())

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				user,
				courses: enrichedCourses,
				streaks,
			},
			message: 'Member details fetched successfully',
		})
	})
)

// Make or remove admin
router.put(
	'/toggleAdmin',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const user = await User.findById(req.body.userId)
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		// Toggle admin status
		const newAdminStatus = !user.isAdmin
		await User.findByIdAndUpdate(req.body.userId, {
			isAdmin: newAdminStatus,
		})

		const message = newAdminStatus
			? 'User made admin'
			: 'Admin access removed from user'

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { isAdmin: newAdminStatus },
			message,
		})
	})
)

module.exports = router
