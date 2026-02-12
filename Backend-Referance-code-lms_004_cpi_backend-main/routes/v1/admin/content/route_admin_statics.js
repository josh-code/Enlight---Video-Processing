const express = require('express')
const router = express.Router()
const { Course } = require('../../../../models/common/content/course_model')
const { Session } = require('../../../../models/common/content/session_model')
const {
	UserProgress,
} = require('../../../../models/app/content/user_progress_model')
const auth = require('../../../../middleware/auth')
const { User } = require('../../../../models/app/user_model')
const {
	Tracking_UserActions,
} = require('../../../../models/app/tracking/tracking_UserActions_model')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

// Helper function to get course information
async function getCourseInfo(sessionIds, courseIds) {
	const sessions = await Session.find({
		_id: { $in: sessionIds },
		courseId: { $in: courseIds },
	})
	const courseMap = {}

	// Initialize course map with session data
	sessions.forEach((session) => {
		if (!courseMap[session.courseId]) {
			courseMap[session.courseId] = {
				name: '',
				count: 0,
				userCount: 0,
				uniqueUsers: new Set(), // Add a Set to track unique users
			}
		}
		courseMap[session.courseId].count++
	})

	const uniqueCourseIds = Object.keys(courseMap)
	const courses = await Course.find({ _id: { $in: uniqueCourseIds } })

	// Populate course names in the course map
	courses.forEach((course) => {
		if (courseMap[course._id]) {
			courseMap[course._id].name = course.name
		}
	})

	return { courseMap, sessions }
}

// Route handler for /currentlyWatchingStats
router.get(
	'/currentlyWatchingStats',
	catchAsyncError(async (req, res, next) => {
		// Step 1: Get courses
		const courses = await Course.aggregate([
			{ $match: { isDraft: false } },
			{ $sort: { index: -1 } },
		])
		const courseIds = courses.map((course) => course._id.toString())

		// Step 2: Find enabled users
		const users = await User.find({
			isEnabled: true,
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})
		const userIds = users.map((user) => user._id.toString())

		// Step 4: Aggregate session IDs and user IDs from UserProgress
		const userProgresses = await UserProgress.aggregate([
			{ $match: { userId: { $in: userIds } } },
			{ $unwind: '$progress' },
			{
				$group: {
					_id: '$progress._id',
					users: { $addToSet: '$userId' },
				},
			},
		])

		// Step 5: Get session IDs
		const sessionIds = userProgresses.map((progress) => progress._id)

		// Step 6: Get course info for the filtered sessions and courses
		const { courseMap, sessions } = await getCourseInfo(sessionIds, courseIds)

		// Step 7: Calculate unique user counts for each course
		userProgresses.forEach((progress) => {
			const session = sessions.find(
				(session) => session._id.toString() === progress._id.toString()
			)
			if (session && courseMap[session.courseId]) {
				progress.users.forEach((userId) => {
					courseMap[session.courseId].uniqueUsers.add(userId)
				})
				courseMap[session.courseId].userCount =
					courseMap[session.courseId].uniqueUsers.size
			}
		})

		// Step 8: Format the result and calculate percentages
		const result = Object.keys(courseMap)
			.map((courseId) => {
				const courseInfo = courseMap[courseId]
				const percentage = userIds.length
					? ((courseInfo.userCount / userIds.length) * 100).toFixed(2)
					: 0
				return {
					courseId: courseId,
					courseName: courseInfo.name,
					userCount: courseInfo.userCount,
					percentage: parseFloat(percentage),
				}
			})
			.sort((a, b) => b.userCount - a.userCount)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { result, totalUser: userIds.length },
			message: 'Currently watching stats fetched successfully',
		})
	})
)

function getTimeFrame(filter) {
	const now = new Date()
	let start, end

	switch (filter) {
		case 'daily':
			start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6) // 6 days ago including today
			end = now // Today
			break
		case 'weekly':
			start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 * 7) // 6 weeks ago including today
			end = now // Today
			break
		case 'monthly':
			start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()) // 6 months ago including today
			end = now // Today
			break
		default:
			throw new Error('Invalid time frame')
	}

	return { start, end }
}

router.get(
	'/getAppLaunchStats',
	catchAsyncError(async (req, res, next) => {
		const { filter } = req.query
		if (!['daily', 'weekly', 'monthly'].includes(filter)) {
			return next(new ErrorHandler('Invalid filter', HTTP.BAD_REQUEST))
		}

		const { start, end } = getTimeFrame(filter)

		// Step 1: Fetch user IDs
		let userQuery = {
			isEnabled: true,
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		}

		const users = await User.find(userQuery).select('_id')

		const userIds = users.map((user) => user._id.toString())

		// Step 2: Modify the match stage to include the filtered user IDs
		let matchStage = {
			action: 'session',
			date: { $gte: start, $lte: end },
			userId: { $in: userIds },
		}

		let groupStage = {}
		let sortStage = {}
		let limitStage = {}

		// Determine the group stage based on the filter
		switch (filter) {
			case 'daily':
				groupStage = {
					_id: { $dayOfWeek: '$date' },
					count: { $sum: 1 },
				}
				break
			case 'weekly':
				groupStage = {
					_id: { $week: '$date' },
					count: { $sum: 1 },
				}
				sortStage = { _id: -1 }
				limitStage = { $limit: 7 }
				break
			case 'monthly':
				groupStage = {
					_id: { $month: '$date' },
					count: { $sum: 1 },
				}
				sortStage = { _id: -1 } // Sort by month descending
				limitStage = { $limit: 7 } // Ensure to limit to last 7 months
				break
		}

		// let matchStage = { action: "session", date: { $gte: start, $lte: end } };
		let pipeline = [{ $match: matchStage }, { $group: groupStage }]

		if (filter === 'weekly' || filter === 'monthly') {
			pipeline.push({ $sort: sortStage })
			pipeline.push(limitStage)
		}

		pipeline.push({
			$project: {
				_id: 0,
				period: '$_id',
				count: 1,
			},
		})

		let data = await Tracking_UserActions.aggregate(pipeline)

		const now = new Date()

		// Initialize grouped data with zero counts
		let groupedData = {}
		if (filter === 'daily') {
			for (let i = 0; i < 7; i++) {
				const date = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - i
				)
				groupedData[date.getDay()] = {
					day: date.toDateString().split(' ')[0],
					count: 0,
				}
			}
		} else if (filter === 'weekly') {
			let current = new Date(end)
			for (let i = 0; i < 7; i++) {
				const weekStartDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - i * 7
				)

				const weekNumber = Math.round(
					((weekStartDate - new Date(weekStartDate.getFullYear(), 0, 1)) /
						86400000 +
						1) /
						7
				)
				const weekEnd = new Date(current)
				const weekStart = new Date(weekEnd)
				weekStart.setDate(weekStart.getDate() - 6)
				const week = `${weekStart.getDate()} ${weekStart.toLocaleString(
					'default',
					{ month: 'short' }
				)}-${weekEnd.getDate()} ${weekEnd.toLocaleString('default', {
					month: 'short',
				})}`
				groupedData[`Week ${weekNumber}`] = { week, count: 0 }
				current.setDate(current.getDate() - 7)
			}
		} else if (filter === 'monthly') {
			for (let i = 0; i < 7; i++) {
				const monthIndex = (now.getMonth() - i + 12) % 12
				groupedData[monthIndex] = {
					month: monthIndex,
					count: 0,
				}
			}
		}

		// Fill grouped data with actual counts
		data.forEach((d) => {
			let periodKey
			if (filter === 'daily') {
				periodKey = d.period - 1 // Adjust for 0-based index
			} else if (filter === 'weekly') {
				periodKey = `Week ${d.period}`
			} else if (filter === 'monthly') {
				periodKey = d.period - 1 // Adjust for 0-based index
			}

			if (groupedData[periodKey] !== undefined) {
				groupedData[periodKey].count = d.count
			}
		})

		// Prepare the result in the correct order
		let result = []
		if (filter === 'daily') {
			for (let i = 0; i < 7; i++) {
				const date = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - i
				)
				let dayKey = date.getDay()
				let dayData = groupedData[dayKey]
				result.unshift({
					period: dayData.day,
					count: dayData.count,
					averageCount: dayData.count,
				})
			}
		} else if (filter === 'weekly') {
			// put back 7 for 7 weeks in condition
			for (let i = 0; i < 5; i++) {
				const weekStartDate = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - i * 7
				)
				const weekNumber = Math.round(
					((weekStartDate - new Date(weekStartDate.getFullYear(), 0, 1)) /
						86400000 +
						1) /
						7
				)

				let weekKey = `Week ${weekNumber}`
				let weekData = groupedData[weekKey]
				result.unshift({
					period: weekData.week,
					// period: weekKey,
					count: weekData.count,
					averageCount: Math.round(weekData.count / 7),
				})
			}
		} else if (filter === 'monthly') {
			const monthNames = [
				'Jan',
				'Feb',
				'Mar',
				'Apr',
				'May',
				'Jun',
				'Jul',
				'Aug',
				'Sep',
				'Oct',
				'Nov',
				'Dec',
			]
			for (let i = 0; i < 7; i++) {
				const monthIndex = (now.getMonth() - i + 12) % 12
				let monthData = groupedData[monthIndex]
				result.unshift({
					period: monthNames[monthIndex],
					count: monthData.count,
					averageCount: Math.round(monthData.count / 30),
				})
			}
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: result,
			message: 'App launch stats fetched successfully',
		})
	})
)

router.get(
	'/getTimeSpentStats',
	catchAsyncError(async (req, res, next) => {
		const { filter } = req.query
		if (!['daily', 'weekly', 'monthly'].includes(filter)) {
			return next(new ErrorHandler('Invalid filter', HTTP.BAD_REQUEST))
		}

		const { start, end } = getTimeFrame(filter)

		// Build the user query
		const userQuery = { isEnabled: true }

		// Find enabled users who are marked as users
		const users = await User.find(userQuery).select('_id')
		const userIds = users.map((user) => user._id.toString())

		// Find user progress within the specified time frame
		const progressData = await UserProgress.find({ userId: { $in: userIds } })

		// Filter progress entries based on watchedAt
		let filteredProgress = []
		for (let progressDoc of progressData) {
			for (let progress of progressDoc.progress) {
				let watchedAt = new Date(progress.watchedAt)
				if (watchedAt >= start && watchedAt < end) {
					filteredProgress.push({
						...progress,
						userId: progressDoc.userId,
						watchedAtDate: watchedAt,
					})
				}
			}
		}

		// Retrieve session durations for filtered progress entries
		const sessionIds = filteredProgress.map((p) => p._id)
		const sessions = await Session.find({ _id: { $in: sessionIds } })

		let sessionMap = {}
		sessions.forEach((session) => {
			sessionMap[session._id] = session.duration || { en: 0, es: 0 }
		})

		filteredProgress = filteredProgress.map((p) => ({
			...p,
			sessionDuration: sessionMap[p._id] || { en: 0, es: 0 },
		}))

		const now = new Date()

		// Initialize grouped data with zero durations
		let groupedData = {}
		if (filter === 'daily') {
			for (let i = 0; i < 7; i++) {
				const date = new Date(
					now.getFullYear(),
					now.getMonth(),
					now.getDate() - i
				)
				groupedData[date.getDay()] = {
					day: date.toDateString().split(' ')[0],
					en: { totalDuration: 0, count: 0 },
					es: { totalDuration: 0, count: 0 },
				}
			}
		} else if (filter === 'weekly') {
			let current = new Date(end)
			for (let i = 0; i < 5; i++) {
				const weekEnd = new Date(current)
				const weekStart = new Date(weekEnd)
				weekStart.setDate(weekStart.getDate() - 6)
				groupedData[`Week ${i + 1}`] = {
					week: `${weekStart.getDate()} ${weekStart.toLocaleString('default', {
						month: 'short',
					})}-${weekEnd.getDate()} ${weekEnd.toLocaleString('default', {
						month: 'short',
					})}`,
					en: { totalDuration: 0, count: 0 },
					es: { totalDuration: 0, count: 0 },
				}
				current.setDate(current.getDate() - 7)
			}
		} else if (filter === 'monthly') {
			for (let i = 0; i < 7; i++) {
				const monthIndex = (now.getMonth() - i + 12) % 12
				groupedData[monthIndex] = {
					month: monthIndex,
					en: { totalDuration: 0, count: 0 },
					es: { totalDuration: 0, count: 0 },
				}
			}
		}

		// Fill grouped data with actual durations
		filteredProgress.forEach((p) => {
			let periodKey
			if (filter === 'daily') {
				periodKey = p.watchedAtDate.getDay()
			} else if (filter === 'weekly') {
				const weekDifference = Math.floor(
					(end - p.watchedAtDate) / (1000 * 60 * 60 * 24 * 7)
				)
				periodKey = `Week ${weekDifference + 1}`
			} else if (filter === 'monthly') {
				periodKey = p.watchedAtDate.getMonth()
			}

			if (groupedData[periodKey]) {
				Object.keys(p.sessionDuration).forEach((lang) => {
					if (!groupedData[periodKey][lang]) {
						groupedData[periodKey][lang] = { totalDuration: 0, count: 0 }
					}
					groupedData[periodKey][lang].totalDuration += p.sessionDuration[lang]
					groupedData[periodKey][lang].count += 1
				})
			}
		})

		let totalTimeSpent = { en: 0, es: 0 }
		let totalAverageTimeSpent = { en: 0, es: 0 }
		let result = []

		Object.entries(groupedData).forEach(([key, data]) => {
			let averageDuration = {
				en: Math.round((data.en.totalDuration || 0) / 3600),
				es: Math.round((data.es.totalDuration || 0) / 3600),
			}
			totalAverageTimeSpent.en += averageDuration.en
			totalAverageTimeSpent.es += averageDuration.es
			totalTimeSpent.en += data.en.totalDuration
			totalTimeSpent.es += data.es.totalDuration

			result.unshift({
				period:
					data.day ||
					data.week ||
					(data.month !== undefined
						? new Date(0, data.month).toLocaleString('default', {
								month: 'short',
							})
						: key),
				averageDuration,
				totalDuration: {
					en: Math.round(data.en.totalDuration / 3600),
					es: Math.round(data.es.totalDuration / 3600),
				},
			})
		})

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { result, totalTimeSpent, totalAverageTimeSpent },
			message: 'Time spent stats fetched successfully',
		})
	})
)

module.exports = router
