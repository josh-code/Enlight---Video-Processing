const express = require('express')
const _ = require('lodash')
const router = express.Router()
const auth = require('../../../../middleware/auth')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const {
	UserProgress,
} = require('../../../../models/app/content/user_progress_model')
const { Session } = require('../../../../models/common/content/session_model')
const { Course } = require('../../../../models/common/content/course_model')
const { User } = require('../../../../models/app/user_model')
const {
	sendNotificationToUser,
} = require('../../../../services/expoPushNotification')
const { BADGES, HIATUS_THRESHOLD_DAYS } = require('../../../../contant')
const { Module } = require('../../../../models/common/content/module_model')
const {
	assignBadgeToUser,
	hasBadgeBeenAwarded,
} = require('../../../../services/badge')
const {
	Tracking_UserActions,
} = require('../../../../models/app/tracking/tracking_UserActions_model')
const UserBadges = require('../../../../models/common/content/user_badges_model')
const { default: mongoose } = require('mongoose')
const clientTypeMiddleware = require('../../../../middleware/clientTypeMiddleware')
const featureFlagMiddleware = require('../../../../middleware/featureFlag')
const FeatureFlagsModel = require('../../../../models/common/content/features_model')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

router.put(
	'/courseWishlistToggle',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'coursePage.canWishlist',
		mobilePath: 'courseScreen.canWishlistCourse',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { courseId } = req.body
		const userId = req.user._id

		// Find the user's progress document
		const userProgress = await UserProgress.findOne({ userId })
		if (!userProgress) {
			return next(new ErrorHandler('User progress not found.', HTTP.NOT_FOUND))
		}

		// Toggle course in wishlist
		const courseIndex = userProgress.wishlistCourses.indexOf(courseId)
		if (courseIndex === -1) {
			// If course is not in the wishlist, add it
			userProgress.wishlistCourses.push(courseId)
		} else {
			// If course is already in the wishlist, remove it
			userProgress.wishlistCourses.splice(courseIndex, 1)
		}

		// Save the updated user progress
		await userProgress.save()
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message:
				courseIndex === -1
					? 'Course added to wishlist'
					: 'Course removed from wishlist',
			data: userProgress,
		})
	})
)

router.put(
	'/updateProgress',
	clientTypeMiddleware,
	[auth],
	catchAsyncError(async (req, res, next) => {
		const {
			savingCourseId,
			savingSessionId,
			userProgress: progressPayload,
		} = req.body

		const clientType = req.clientType

		if (!savingCourseId || !savingSessionId || !progressPayload) {
			return next(new ErrorHandler('Missing required fields', HTTP.BAD_REQUEST))
		}

		const results = await Promise.allSettled([
			User.findById(req.user._id),
			Course.findById(savingCourseId),
			Session.findById(savingSessionId),
			FeatureFlagsModel.findOne(),
		])

		const user = results[0].status === 'fulfilled' ? results[0].value : null
		const course = results[1].status === 'fulfilled' ? results[1].value : null
		const session = results[2].status === 'fulfilled' ? results[2].value : null
		const featureFlags =
			results[3].status === 'fulfilled' ? (results[3].value?.data ?? {}) : null

		if (!featureFlags) {
			return next(
				new ErrorHandler('Feature flags not found', HTTP.INTERNAL_SERVER_ERROR)
			)
		}

		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found', HTTP.BAD_REQUEST))
		}

		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.BAD_REQUEST))
		}

		if (!session) {
			return next(new ErrorHandler('Session not found', HTTP.BAD_REQUEST))
		}

		// Check if user can access this course
		const accessCheck = await canAccessCourse(savingCourseId, req.user._id)
		if (!accessCheck.canAccess) {
			return next(
				new ErrorHandler(accessCheck.reason, HTTP.FORBIDDEN, {
					locked: true,
					requiredCourse: accessCheck.requiredCourse,
				})
			)
		}

		const canTakeQuiz =
			clientType === 'mobile'
				? (featureFlags?.mobile?.sessionScreen?.canTakeQuiz?.enabled ?? false)
				: (featureFlags?.webApp?.sessionPage?.canTakeQuiz?.enabled ?? false)

		if (session.quiz && session.quiz.questions?.length > 0 && !canTakeQuiz) {
			return next(
				new ErrorHandler('Quiz is not allowed right now.', HTTP.BAD_REQUEST)
			)
		}

		let toUpdate = _.pick(progressPayload, [
			'progress',
			'userId',
			'currentSemsterId',
			'currentCourseId',
			'currentSessionId',
			'completedCourses',
		])

		toUpdate.userId = req.user._id

		const userProgress = await UserProgress.findOne({ userId: req.user._id })

		let updatedProgress

		if (userProgress) {
			updatedProgress = await UserProgress.findByIdAndUpdate(
				{
					_id: userProgress._id,
				},
				toUpdate,
				{ new: true }
			)
		} else {
			updatedProgress = await UserProgress.create(toUpdate)
		}

		assignResilientReturnerBadge({
			userId: req.user._id,
			progress: updatedProgress.progress,
			savingSessionId: savingSessionId,
		})

		assignBadgesForQuizzes({
			userId: req.user._id,
			progress: updatedProgress.progress,
			savingSessionId: savingSessionId,
		})

		assignQuizBadges({
			userId: req.user._id,
			progress: updatedProgress.progress,
		})

		// Assing badge when user completed first lesson
		if (updatedProgress.progress.length === 1) {
			assignBadgesForFirstLecture({
				userId: req.user._id,
				savingCourseId,
				progress: updatedProgress.progress,
			})
		}

		const courseCompleted = await checkCourseCompletion(
			savingCourseId,
			user._id.toString()
		)

		if (courseCompleted) {
			// Ensure completedCourses is initialized
			if (!updatedProgress.completedCourses) {
				updatedProgress.completedCourses = []
			}

			// Check if the course is already in the completedCourses array
			const completedCourseIndex = updatedProgress.completedCourses.findIndex(
				(course) => course.course.toString() === savingCourseId.toString()
			)

			if (completedCourseIndex === -1) {
				// Add course to completedCourses and send notification
				updatedProgress.completedCourses.push({
					course: savingCourseId,
					completedAt: new Date(),
				})

				// Save progress
				await updatedProgress.save()

				sendNotificationToUser({
					userId: user._id,
					notificationKey: 'courseCompletion',
					variables: {
						courseName: course.name,
					},
				})
			} else {
				console.log('Course already completed')
			}
		} else {
			console.log('Course not completed')
		}

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Progress updated successfully',
			data: updatedProgress,
		})
	})
)

router.put(
	'/updateSessionProgress',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { sessionId, time } = req.body

		if (!sessionId || !time) {
			return next(new ErrorHandler('Missing required fields', HTTP.BAD_REQUEST))
		}

		const user = await User.findById(req.user._id)

		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found', HTTP.BAD_REQUEST))
		}

		const userProgress = await UserProgress.findOne({ userId: req.user._id })

		let updatedProgress

		if (userProgress) {
			userProgress.sessionProgress = { sessionId, time }
			updatedProgress = await UserProgress.findByIdAndUpdate(
				{
					_id: userProgress._id,
				},
				userProgress,
				{ new: true }
			)
		} else {
			updatedProgress = await UserProgress.create({
				userId: req.user._id,
				sessionProgress: { sessionId, time },
			})
		}

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Session progress updated successfully',
			data: updatedProgress,
		})
	})
)

async function getCourseCompletionForUser(user, platform) {
	const features = (await FeatureFlagsModel.findOne().lean()).data || {}

	const featureFlags =
		platform === 'mobile'
			? {
					completedCourses:
						!!features?.mobile?.myLearningScreen?.completedCoursesList?.enabled,
					wishlistCourses:
						!!features?.mobile?.myLearningScreen?.wishlistCoursesList?.enabled,
				}
			: {
					completedCourses:
						!!features?.webApp?.myLearning?.completedCoursesList?.enabled,
					wishlistCourses:
						!!features?.webApp?.myLearning?.wishlistCoursesList?.enabled,
				}

	// If neither feature is enabled, return empty
	if (!featureFlags.completedCourses && !featureFlags.wishlistCourses) {
		return {}
	}

	const userProgress = await UserProgress.findOne({
		userId: user._id.toString(),
	}).lean()

	const response = {}

	// Wishlist courses
	if (featureFlags.wishlistCourses) {
		if (userProgress?.wishlistCourses?.length) {
			response.wishlistCourses = await Course.find({
				_id: { $in: userProgress.wishlistCourses },
				isDraft: { $ne: true },
			})
		} else {
			response.wishlistCourses = []
		}
	}

	// Completed courses
	if (featureFlags.completedCourses) {
		const allCourses = await Course.find({ isDraft: { $ne: true } }).lean()
		const completedCourses = []

		const completedCourseIds = userProgress?.completedCourses?.map((c) =>
			c.course.toString()
		)

		for (const course of allCourses) {
			if (completedCourseIds?.includes(course._id.toString())) {
				const completedAt = userProgress.completedCourses?.find(
					(c) => c.course.toString() === course._id.toString()
				)?.completedAt

				completedCourses.push({ ...course, completedAt })
			}
		}

		response.completedCourses = completedCourses
	}

	return response
}

async function checkCourseCompletion(courseId, userId) {
	try {
		const userProgress = await UserProgress.findOne({ userId }).lean()
		if (!userProgress) {
			return false
		}

		const completedSessionIds = userProgress.progress.map((p) =>
			p._id.toString()
		)

		const courseSessions = await Session.find({ courseId }).lean()
		const courseSessionIds = courseSessions.map((session) =>
			session._id.toString()
		)

		const hasCompletedSessions = courseSessionIds.every((sessionId) =>
			completedSessionIds.includes(sessionId)
		)

		return hasCompletedSessions
	} catch (error) {
		console.error('Error checking course completion:', error)
		return false
	}
}

// Check if user can access a course based on prerequisites
async function canAccessCourse(courseId, userId) {
	try {
		const course = await Course.findById(courseId)
			.select('_id index name isDraft')
			.lean()

		if (!course || course.isDraft) {
			return { canAccess: false, reason: 'Course not found' }
		}

		// Course 1 (index 1) is always accessible
		if (course.index === 1) {
			return { canAccess: true }
		}

		// Check if user has completed all previous courses
		const previousCourses = await Course.find({
			index: { $lt: course.index },
			isDraft: false,
		})
			.select('_id index name isDraft')
			.sort({ index: 1 })
			.lean()

		for (const prevCourse of previousCourses) {
			const isCompleted = await checkCourseCompletion(
				prevCourse._id.toString(),
				userId
			)

			if (!isCompleted) {
				return {
					canAccess: false,
					reason: `Complete ${
						prevCourse.name.en || `Course ${prevCourse.index}`
					} to unlock this course`,
					requiredCourse: prevCourse,
				}
			}
		}

		return { canAccess: true }
	} catch (error) {
		console.error('Error checking course access:', error)
		return { canAccess: false, reason: 'Error checking access' }
	}
}

async function assignBadgesForFirstLecture({
	userId,
	progress,
	savingCourseId,
}) {
	try {
		// Step 1: Retrieve the course details from the database
		const course = await Course.findById(savingCourseId)

		if (!course) {
			console.log(`Course with ID ${savingCourseId} not found`)
			return
		}

		if (course.index > 1) {
			return
		}

		let firstSession

		// Step 2: Determine if the course is modular or non-modular
		if (course.isModular) {
			// Modular Course: Find the module with the lowest index, then find its first session
			const firstModule = await Module.find({ course: course._id })
				.sort({ index: 1 })
				.limit(1)
				.lean()

			if (firstModule && firstModule.length > 0) {
				// Find the first session within the first module
				firstSession = await Session.find({ moduleId: firstModule[0]._id })
					.sort({ index: 1 })
					.limit(1)
					.lean()
			}
		} else {
			// Non-Modular Course: Find the first session directly from the course's sessions
			firstSession = await Session.find({ courseId: course._id })
				.sort({ index: 1 })
				.limit(1)
				.lean()
		}

		// Step 3: Handle cases where no session was found
		if (!firstSession || firstSession.length === 0) {
			console.log('No sessions found for the course')
			return
		}

		// Step 4: Check if the user has completed the first session (lecture)
		const firstSessionCompleted = progress.some(
			(session) => session._id.toString() === firstSession[0]._id.toString()
		)

		// Step 5: If first session is completed, assign the "Mustard Seed Starter" badge
		if (firstSessionCompleted) {
			await assignBadgeToUser(userId, BADGES.Mustard_Seed_Starter)
		} else {
			console.log(`First session not completed by user ${userId}`)
		}
	} catch (error) {
		console.error(
			`Error while assigning "Mustard Seed Starter" badge to user ${userId}:`,
			error
		)
	}
}

async function assignBadgesForQuizzes({ progress, userId, savingSessionId }) {
	try {
		// Step 1: Find the progress for the current saving session
		const progressItem = progress.find(
			(item) => item._id.toString() === savingSessionId.toString()
		)

		// Step 2: If there's no matching progress for the current session, exit
		if (!progressItem) {
			console.log(`No progress found for session ${savingSessionId}`)
			return
		}

		// Step 3: Fetch the session data for the current session
		const session = await Session.findById(savingSessionId).lean()

		if (session && session.quiz && progressItem.quizAttempt) {
			// Step 4: Calculate correct answers for the current session
			const correctAnswers = calculateCorrectAnswers(
				session,
				progressItem.quizAttempt
			)

			const quizTotalQuestions = session.quiz.questions.length
			const quizScore = correctAnswers / quizTotalQuestions

			// Step 5: Award "Quiz Whiz" badge if the user got 100% on the quiz
			if (quizScore === 1) {
				// The "Quiz Whiz" badge can be earned multiple times, but only award it for this session
				await assignBadgeToUser(userId, BADGES.Quiz_Whiz)
				console.log(
					`Awarded "Quiz Whiz" to user ${userId} for session ${session._id}`
				)
			} else {
				console.log('User did not score 100%')
			}
		} else {
			console.log('Not attemped')
		}
	} catch (error) {
		console.error('Error assigning badges for quizzes:', error)
	}
}

async function assignResilientReturnerBadge({
	progress,
	userId,
	savingSessionId,
}) {
	try {
		// Step 1: Get last action of user from user action tracking skip todays actions
		const todayStart = new Date()
		todayStart.setHours(0, 0, 0, 0)

		const actions = await Tracking_UserActions.find({
			userId,
			date: { $lt: todayStart },
		})
			.sort({ date: -1 })
			.limit(1)

		const lastAction = actions.length > 0 ? actions[0] : null

		if (!lastAction) {
			return
		}

		// Step 2: Get 'Watched At' of current saving session
		const currentSessionProgress = progress.find(
			(p) => p?._id?.toString() === savingSessionId?.toString()
		)

		if (!currentSessionProgress || !currentSessionProgress.watchedAt) {
			return
		}

		const lastActionDate = lastAction
			? new Date(lastAction.date).getTime()
			: null
		const currentWatchedAt = new Date(
			currentSessionProgress.watchedAt
		).getTime()

		// Step 3: Check if the user already earned the "Resilient Returner" badge today
		const userBadge = await UserBadges.findOne({
			user: userId,
			badge: BADGES.Resilient_Returner,
			lastEarned: { $gte: todayStart },
		})

		if (userBadge) {
			console.log(
				`User ${userId} has already earned "Resilient Returner" badge today, skipping.`
			)
			return
		}

		// Step 3: Check if the last action was more than or equal to HIATUS_THRESHOLD_DAYS
		if (lastActionDate) {
			const timeDiffInDays = Math.floor(
				(currentWatchedAt - lastActionDate) / (1000 * 60 * 60 * 24)
			)

			console.log({ timeDiffInDays })

			if (timeDiffInDays >= HIATUS_THRESHOLD_DAYS) {
				// Step 4: Award the "Resilient Returner"
				await assignBadgeToUser(userId, BADGES.Resilient_Returner)
			}
		} else {
			console.log(
				`No prior activity for user ${userId}, not awarding "Resilient Returner"`
			)
		}
	} catch (error) {
		console.error(
			`Error awarding "Resilient Returner" badge to user ${userId}:`,
			error
		)
	}
}

async function assignQuizBadges({ userId, progress }) {
	try {
		// Step 1: Fetch all active courses
		const activeCourses = await Course.find({ isDraft: false })
			.select('_id')
			.lean()

		if (!activeCourses || activeCourses.length === 0) {
			console.log('No active courses found')
			return
		}

		const activeCourseIds = activeCourses.map((course) => course._id.toString())

		// Step 2: Fetch all sessions with quizzes that belong to non-draft courses
		const sessionsWithQuizzes = await Session.find({
			courseId: { $in: activeCourseIds },
			'quiz.questions': { $exists: true, $ne: [] },
		}).lean()

		if (!sessionsWithQuizzes || sessionsWithQuizzes.length === 0) {
			console.log('No quiz sessions found in non-draft courses')
			return
		}

		let totalCorrectAnswers = 0
		let totalQuestions = 0
		let allPerfectScores = true

		// Step 3: Loop through each session that has quiz
		for (const session of sessionsWithQuizzes) {
			// Check if user has completed this session's quiz in their progress
			const progressItem = progress.find(
				(p) => p?._id?.toString() === session?._id?.toString()
			)

			if (!progressItem || !progressItem.quizAttempt) {
				// If the user hasn't completed this quiz, they can't get the badge
				allPerfectScores = false
				continue
			}

			// Step 4: Calculate the score for the current quiz
			const correctAnswers = calculateCorrectAnswers(
				session,
				progressItem.quizAttempt
			)
			const quizTotalQuestions = session?.quiz?.questions?.length
			const quizScore = correctAnswers / quizTotalQuestions

			// Add to the total score and questions for Wisdom Seeker badge calculation
			totalCorrectAnswers += correctAnswers
			totalQuestions += quizTotalQuestions

			// If the quiz score is not 100%, user doesn't qualify for "Angel's Advocate"
			if (quizScore < 1) {
				allPerfectScores = false
			}
		}

		// Step 5: Award "Angel's Advocate" badge if user has perfect scores on all quizzes
		if (allPerfectScores && totalQuestions > 0) {
			const hasAngelBadge = await hasBadgeBeenAwarded(
				userId,
				BADGES.Angels_Advocate
			)

			if (!hasAngelBadge) {
				await assignBadgeToUser(userId, BADGES.Angels_Advocate)
				console.log(`Awarded "Angel's Advocate" badge to user ${userId}`)
			} else {
				console.log(`User ${userId} already has "Angel's Advocate" badge`)
			}
		}

		// Step 6: Calculate the average score for "Wisdom Seeker"
		const averageScore = totalCorrectAnswers / totalQuestions

		// Step 7: Ensure user has completed all quizzes before awarding "Wisdom Seeker"
		const totalQuizzes = sessionsWithQuizzes.length
		const completedQuizzes = progress.filter((session) =>
			sessionsWithQuizzes.some(
				(s) => s._id.toString() === session._id.toString()
			)
		)

		if (completedQuizzes.length === totalQuizzes && averageScore >= 0.9) {
			const hasWisdomSeekerBadge = await hasBadgeBeenAwarded(
				userId,
				BADGES.Wisdom_Seeker
			)

			if (!hasWisdomSeekerBadge) {
				await assignBadgeToUser(userId, BADGES.Wisdom_Seeker)
				console.log(`Awarded "Wisdom Seeker" badge to user ${userId}`)
			} else {
				console.log(`User ${userId} already has "Wisdom Seeker" badge`)
			}
		} else {
			console.log(
				`User ${userId} has not completed all quizzes or doesn't meet the 90% average score`
			)
		}
	} catch (error) {
		console.error(`Error assigning quiz badges to user ${userId}:`, error)
	}
}

const calculateCorrectAnswers = (session, quizAttempts) => {
	let correctAnswers = 0

	quizAttempts.forEach((quizAttempt) => {
		const question = session.quiz.questions.find(
			(q) => q._id.toString() === quizAttempt.questionId.toString()
		)

		if (
			question &&
			question.correctOptionId.toString() === quizAttempt.selectedId.toString()
		) {
			correctAnswers += 1
		}
	})

	return correctAnswers
}

router.get(
	'/:id',
	[clientTypeMiddleware, auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.params.id

		const clientType = req.clientType

		// Find the user
		const user = await User.findById(userId)
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		// Find the user's progress, or create an initial progress if none exists
		let progress = await UserProgress.findOne({ userId })
		if (!progress) {
			const [firstCourse] = await Course.find({ isDraft: { $ne: true } }).sort({
				index: 'ascending',
			})
			console.log({ firstCourse })
			if (!firstCourse) {
				return next(new ErrorHandler('No courses found', HTTP.NOT_FOUND))
			}

			const [firstSession] = await Session.find({
				courseId: firstCourse._id.toString(),
			}).sort({ index: 'ascending' })
			if (!firstSession) {
				return next(
					new ErrorHandler(
						'No sessions found for the first course',
						HTTP.NOT_FOUND
					)
				)
			}

			// Create initial progress
			progress = new UserProgress({
				userId,
				progress: [],
				currentCourseId: firstCourse._id,
				currentSessionId: firstSession._id,
			})
			await progress.save()
		}

		// Validate currentCourseId before querying
		let currentCourse = null
		if (
			progress.currentCourseId &&
			mongoose.isValidObjectId(progress.currentCourseId)
		) {
			currentCourse = await Course.findById(progress.currentCourseId)
		}

		// Validate currentSessionId before querying
		let currentSession = null
		if (
			progress.currentSessionId &&
			mongoose.isValidObjectId(progress.currentSessionId)
		) {
			currentSession = await Session.findById(progress.currentSessionId)
		}

		// Build the response object
		const result = {
			progress,
			courseName: currentCourse?.name || null,
			courseImage: currentCourse?.image || null,
			currentSession: currentSession
				? {
						...currentSession.toObject(),
						courseName: currentCourse?.name || null,
					}
				: null,
		}

		const courseCompletion = await getCourseCompletionForUser(user, clientType)

		result.courseCompletion = courseCompletion

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'User progress retrieved successfully',
			data: result,
		})
	})
)

module.exports = router
module.exports.canAccessCourse = canAccessCourse
