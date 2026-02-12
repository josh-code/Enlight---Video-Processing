const express = require('express')
const router = express.Router()
const auth = require('../../../../middleware/auth')
const clientTypeMiddleware = require('../../../../middleware/clientTypeMiddleware')
const readingPlanService = require('../../../../services/readingPlan')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const HTTP = require('../../../../constants/httpStatus')

/**
 * GET /api/app/content/reading-plan/calendar
 * Get completed days for calendar display
 */
router.get(
	'/calendar',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { planId, year } = req.query

		const calendarData = await readingPlanService.getCompletedDaysForCalendar(
			userId,
			planId,
			year ? parseInt(year) : null
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: calendarData,
			message: 'Calendar data retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/reading-plan/today
 * Get today's reading with Bible content
 */
router.get(
	'/today',
	clientTypeMiddleware,
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { bibleVersion } = req.query

		if (!bibleVersion) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message:
					'Bible version is required. Please specify a Bible version or set your preference.',
			})
		}

		// Get today's reading
		const todayReading = await readingPlanService.getTodayReading(userId)

		if (!todayReading) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'No reading scheduled for today',
			})
		}

		// Fetch Bible content for each passage
		// const passagesWithContent = await Promise.all(
		//     todayReading.day.passages.map(async (passage) => {
		//         try {
		//             // Try to get JSON format first (better for UI display)
		//             let chapterData;
		//             try {
		//                 chapterData = await bibleApiService.getChapterJSON(
		//                     bibleVersion,
		//                     passage.book,
		//                     passage.chapter
		//                 );
		//             } catch (jsonError) {
		//                 // console.log(`JSON format not available for ${passage.book} ${passage.chapter}, falling back to plain text`);
		//                 // Fallback to plain text if JSON not available
		//                 chapterData = await bibleApiService.getChapter(
		//                     bibleVersion,
		//                     passage.book,
		//                     passage.chapter
		//                 );
		//             }

		//             // Get audio if available
		//             const audioData = await bibleApiService.getChapterAudio(
		//                 bibleVersion,
		//                 passage.book,
		//                 passage.chapter
		//             );

		//             return {
		//                 ...passage.toObject(),
		//                 content: chapterData,
		//                 audio: audioData,
		//             };
		//         } catch (error) {
		//             console.error(
		//                 `Error fetching content for ${passage.book} ${passage.chapter}:`,
		//                 error
		//             );
		//             return {
		//                 ...passage.toObject(),
		//                 content: null,
		//                 audio: null,
		//                 error: "Content not available",
		//             };
		//         }
		//     })
		// );

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: todayReading,
			message: "Today's reading retrieved successfully",
		})
	})
)

/**
 * GET /api/app/content/reading-plan/date/:date
 * Get reading for a specific date with Bible content
 */
router.get(
	'/date/:date',
	clientTypeMiddleware,
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { date } = req.params
		const { bibleVersion } = req.query

		// Validate date format
		const targetDate = new Date(date)
		if (isNaN(targetDate.getTime())) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Invalid date format. Use YYYY-MM-DD',
			})
		}

		if (!bibleVersion) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message:
					'Bible version is required. Please specify a Bible version or set your preference.',
			})
		}

		// Get reading for the specified date
		const readingData = await readingPlanService.getReadingByDate({
			userId,
			date: targetDate,
			bibleVersion,
		})

		if (!readingData) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'No reading scheduled for this date',
			})
		}

		const response = {
			day: readingData.day,
			progress: readingData.progress,
			isCompleted: readingData.isCompleted,
			bibleVersion: bibleVersion,
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: response,
			message: 'Reading for date retrieved successfully',
		})
	})
)

/**
 * PUT /api/app/content/reading-plan/passage-progress
 * Update passage progress
 */
router.put(
	'/passage-progress',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { dayId, passageIndex, progressData } = req.body

		if (!dayId || passageIndex === undefined || !progressData) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Day ID, passage index, and progress data are required',
			})
		}

		const progress = await readingPlanService.updatePassageProgress(
			userId,
			dayId,
			passageIndex,
			progressData
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: progress,
			message: 'Passage progress updated successfully',
		})
	})
)

/**
 * GET /api/app/content/reading-plan/stats
 * Get user's reading statistics
 */
router.get(
	'/stats',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { planId } = req.query

		const stats = await readingPlanService.getUserStats(userId, planId)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: stats,
			message: 'Reading statistics retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/reading-plan/plans
 * Get available reading plans
 */
router.get(
	'/plans',
	[auth],
	catchAsyncError(async (req, res) => {
		const plans = await readingPlanService.getAvailablePlans()

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: plans,
			message: 'Reading plans retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/reading-plan/friends-reading-today
 * Get friends who are reading today
 */
router.get(
	'/friends-reading-today',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const limit = parseInt(req.query.limit) || 3

		const result = await readingPlanService.getFriendsReadingToday(
			userId,
			limit
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: result,
			message: 'Friends reading today retrieved successfully',
		})
	})
)

module.exports = router
