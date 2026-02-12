const mongoose = require('mongoose')
const { Schema } = mongoose
const { ReadingPlan } = require('../../models/common/reading_plan_model')
const { ReadingPlanDay } = require('../../models/common/reading_plan_day_model')
const {
	UserReadingProgress,
} = require('../../models/app/reading/user_reading_progress_model')
const Message = require('../../models/common/messages_model')
const { User } = require('../../models/app/user_model')
const BIBLE_CONSTANTS = require('../../constants/bible')
const { addDays } = require('date-fns')
const { fromZonedTime, formatInTimeZone } = require('date-fns-tz')
const { generateObjectUrl } = require('../aws/utils')
const BibleApiService = require('../bibleReading')
const ErrorHandler = require('../../utils/errorHandler')
const HTTP = require('../../constants/httpStatus')

class ReadingPlanService {
	constructor() {
		this.bibleApiService = BibleApiService
	}

	// Helper method to get book name from BOOK_MAPPING
	getBookNameFromMapping(bookId) {
		// Find the book name from BOOK_MAPPING by book ID
		const bookEntry = Object.entries(BIBLE_CONSTANTS.BOOK_MAPPING).find(
			([name, id]) => id === bookId
		)
		return bookEntry ? bookEntry[0] : bookId // Return full name or fallback to ID
	}

	// Helper: resolve user's IANA timezone (optionally overridden)
	async getUserTimezone(userId, tzOverride = null) {
		const user = await User.findById(userId)
		return tzOverride || user?.timeZone || 'UTC'
	}

	// Helper: get user's local midnight (as UTC instant) for "today" or provided yyyy-MM-dd
	async getUserDayWindowUtc(userId, dateString = null, tzOverride = null) {
		try {
			const tz = await this.getUserTimezone(userId, tzOverride)
			const ymd = dateString
				? dateString
				: new Date().toLocaleDateString('en-CA', { timeZone: tz })
			const startUtc = fromZonedTime(`${ymd} 00:00:00`, tz)
			const endUtc = addDays(startUtc, 1)
			return { tz, ymd, startUtc, endUtc }
		} catch (error) {
			console.error('Error getting user current date:', error)
			const today = new Date()
			const startUtc = new Date(
				Date.UTC(
					today.getUTCFullYear(),
					today.getUTCMonth(),
					today.getUTCDate()
				)
			)
			return {
				tz: 'UTC',
				ymd: today.toISOString().slice(0, 10),
				startUtc,
				endUtc: addDays(startUtc, 1),
			}
		}
	}

	// Helper function to convert date to user's timezone
	async convertToUserTimezone(userId, date) {
		try {
			const user = await User.findById(userId)
			if (!user || !user.timeZone) {
				return new Date(date.getFullYear(), date.getMonth(), date.getDate())
			}

			// Create a date string in user's timezone
			const options = {
				timeZone: user.timeZone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			}

			const userDateString = date.toLocaleDateString('en-CA', options) // 'en-CA' gives yyyy-mm-dd format
			const [year, month, day] = userDateString.split('-').map(Number)

			return new Date(year, month - 1, day)
		} catch (error) {
			console.error('Error converting to user timezone:', error)
			return new Date(date.getFullYear(), date.getMonth(), date.getDate())
		}
	}

	// Helper function to parse date string in user's timezone
	async parseeDateInUserTimezone(userId, dateString) {
		try {
			const user = await User.findById(userId)
			const userTimezone = user?.timeZone || 'UTC'

			// Parse the date string in user's timezone
			// Assuming dateString is in format "yyyy-mm-dd"
			const [year, month, day] = dateString.split('-').map(Number)

			// Create date in user's timezone
			const date = new Date()
			date.setFullYear(year, month - 1, day)
			date.setHours(0, 0, 0, 0)

			// Convert to user timezone
			const userDate = new Date(
				date.toLocaleString('en-US', { timeZone: userTimezone })
			)
			return new Date(
				userDate.getFullYear(),
				userDate.getMonth(),
				userDate.getDate()
			)
		} catch (error) {
			console.error('Error parsing date in user timezone:', error)
			// Fallback
			const [year, month, day] = dateString.split('-').map(Number)
			return new Date(year, month - 1, day)
		}
	}

	// Get today's reading for a user
	// Optionally accepts tzOverride (IANA) to test/force timezone without changing user profile
	async getTodayReading(userId, planId = null, tzOverride = null) {
		try {
			// Get user's local midnight window (as UTC instants) to determine the year
			const {
				startUtc: todayStart,
				endUtc: todayEnd,
				ymd,
			} = await this.getUserDayWindowUtc(userId, null, tzOverride)

			const canonicalStartUtc = new Date(`${ymd}T00:00:00.000Z`)
			const canonicalEndUtc = addDays(canonicalStartUtc, 1)
			const userYear = canonicalStartUtc.getUTCFullYear()

			if (!planId) {
				const activePlan = await ReadingPlan.findOne({
					isActive: true,
					year: userYear,
				})
				planId = activePlan?._id
			}

			if (!planId) {
				throw new ErrorHandler(
					`No active reading plan found for year ${userYear}. Please contact support.`,
					HTTP.NOT_FOUND
				)
			}

			// Get today's reading day
			const todayReading = await ReadingPlanDay.findOne({
				planId,
				date: { $gte: canonicalStartUtc, $lt: canonicalEndUtc },
			})

			if (!todayReading) {
				throw new ErrorHandler('No reading scheduled for today', HTTP.NOT_FOUND)
			}

			// Use aggregation to get all data in a single query
			const [aggregationResult] = await UserReadingProgress.aggregate([
				// Match user's progress for this plan AND today's specific day
				{
					$match: {
						userId: new mongoose.Types.ObjectId(userId),
						planId: new mongoose.Types.ObjectId(planId),
						dayId: new mongoose.Types.ObjectId(todayReading._id),
					},
				},
				// Group to calculate statistics
				{
					$group: {
						_id: null,
						// Today's progress (should exist since we filtered for today's dayId)
						todayProgress: {
							$first: {
								completedPassages: {
									$size: {
										$filter: {
											input: '$passagesProgress',
											cond: {
												$and: [
													{ $ne: ['$$this', null] },
													{ $eq: ['$$this.completed', true] },
												],
											},
										},
									},
								},
								isCompleted: { $ne: ['$completedAt', null] },
								passagesProgress: '$passagesProgress',
							},
						},
					},
				},
			])

			// Get overall plan statistics separately
			const [overallStats] = await UserReadingProgress.aggregate([
				{
					$match: {
						userId: new mongoose.Types.ObjectId(userId),
						planId: new mongoose.Types.ObjectId(planId),
					},
				},
				{
					$group: {
						_id: null,
						completedDaysInPlan: {
							$sum: {
								$cond: [{ $ne: ['$completedAt', null] }, 1, 0],
							},
						},
					},
				},
				// Lookup total days in plan
				{
					$lookup: {
						from: 'readingplandays',
						let: { planId: new mongoose.Types.ObjectId(planId) },
						pipeline: [
							{ $match: { $expr: { $eq: ['$planId', '$$planId'] } } },
							{ $count: 'total' },
						],
						as: 'totalDays',
					},
				},
				// Project final result
				{
					$project: {
						_id: 0,
						completedDaysInPlan: 1,
						totalDaysInPlan: { $arrayElemAt: ['$totalDays.total', 0] },
					},
				},
			])

			const result = aggregationResult || {}
			const overallResult = overallStats || {}
			const todayProgress = result.todayProgress || {}

			// Calculate today's statistics
			const completedPassages = todayProgress.completedPassages || 0
			const totalPassages = todayReading.passages.length
			const completionPercentage =
				totalPassages > 0
					? Math.round((completedPassages / totalPassages) * 100)
					: 0
			const isCompleted = todayProgress.isCompleted || false

			// Calculate current streak
			const streak = await this.calculateStreak(userId, planId)

			console.log('streak', streak)

			// Create list of all passages with completion status
			const passagesProgress = todayProgress.passagesProgress || []
			const allPassages = todayReading.passages.map((passage, index) => {
				const passageProgress = passagesProgress.find(
					(p) => p && p.passageIndex === index
				)
				const isCompleted = passageProgress ? passageProgress.completed : false

				// Get book name from BOOK_MAPPING
				let bookName = this.getBookNameFromMapping(passage.book)

				return {
					passageKey: `${todayReading._id}:${index}`,
					passageIndex: index,
					book: passage.book,
					chapter: passage.chapter,
					bookName: bookName,
					reference: passage.reference || `${bookName} ${passage.chapter}`,
					verseStart: passage.verseStart ?? null,
					verseEnd: passage.verseEnd ?? null,
					type: passage.type,
					isCompleted,
				}
			})

			return {
				date: todayReading.date,
				dayNumber: todayReading.dayNumber,
				totalPassages,
				completedPassages,
				completionPercentage,
				streak,
				isCompleted,
				passages: allPassages,
				totalDaysInPlan: overallResult.totalDaysInPlan || 0,
				completedDaysInPlan: overallResult.completedDaysInPlan || 0,
				overallPlanProgress:
					overallResult.totalDaysInPlan > 0
						? Math.round(
								(overallResult.completedDaysInPlan /
									overallResult.totalDaysInPlan) *
									100
							)
						: 0,
			}
		} catch (error) {
			console.error("Error getting today's reading:", error)
			throw error
		}
	}

	// Get reading for a specific date
	async getReadingByDate({
		userId,
		date,
		planId = null,
		bibleVersion = 'ENGNLT',
	}) {
		try {
			// Determine the year from the date (using user's timezone)
			const {
				startUtc: dateStart,
				endUtc: dateEnd,
				tz,
				ymd,
			} = await this.getUserDayWindowUtc(
				userId,
				typeof date === 'string'
					? date
					: new Date(date).toISOString().slice(0, 10)
			)
			const canonicalStartUtc = new Date(`${ymd}T00:00:00.000Z`)
			const canonicalEndUtc = addDays(canonicalStartUtc, 1)
			const queryYear = canonicalStartUtc.getUTCFullYear()

			if (!planId) {
				const activePlan = await ReadingPlan.findOne({
					isActive: true,
					year: queryYear,
				})
				planId = activePlan?._id
			}

			if (!planId) {
				throw new ErrorHandler(
					`No active reading plan found for year ${queryYear}. Please contact support.`,
					HTTP.NOT_FOUND
				)
			}

			// Reuse the dateStart, dateEnd, ymd from above
			const { ymd: todayYmd } = await this.getUserDayWindowUtc(userId)

			// Prevent access to future dates by comparing yyy-mm-dd lexicographically
			if (ymd > todayYmd) {
				throw new ErrorHandler(
					"Cannot access future dates. You can only view today's reading and past readings.",
					HTTP.FORBIDDEN
				)
			}

			const readingDay = await ReadingPlanDay.findOne({
				planId,
				date: { $gte: canonicalStartUtc, $lt: canonicalEndUtc },
			}).lean()

			if (!readingDay) {
				throw new ErrorHandler(
					'No reading scheduled for this date',
					HTTP.NOT_FOUND
				)
			}

			const progress = await UserReadingProgress.findOne({
				userId,
				planId,
				dayId: readingDay._id,
			})

			// Get user's preferred Bible version for audio
			if (!bibleVersion) {
				throw new ErrorHandler('Bible version is required', HTTP.BAD_REQUEST)
			}
			// Process passages to include audio information
			const passagesWithAudio = await Promise.all(
				readingDay.passages.map(async (passage, index) => {
					try {
						// Get audio information for this passage
						const audioData = await this.bibleApiService.getChapterAudio(
							bibleVersion,
							passage.book,
							passage.chapter
						)

						// Handle audioData as an array - get the first audio file
						const audioFile =
							Array.isArray(audioData) && audioData.length > 0
								? audioData[0]
								: null

						return {
							...passage,
							hasAudio: !!audioFile,
							audioDuration: audioFile?.duration || null,
							passageKey: `${readingDay._id}:${index}`,
							isCompleted: !!progress?.passagesProgress?.some(
								(p) => p && p.passageIndex === index && p.completed
							),
						}
					} catch (error) {
						console.error(
							`Error getting audio for ${passage.book} ${passage.chapter}:`,
							error
						)
						return {
							...passage,
							hasAudio: false,
							audioDuration: null,
							audioUrl: null,
							passageKey: `${readingDay._id}:${index}`,
							isCompleted: !!progress?.passagesProgress?.some(
								(p) => p && p.passageIndex === index && p.completed
							),
						}
					}
				})
			)

			return {
				day: {
					...readingDay,
					passages: passagesWithAudio,
				},
				progress: progress || null,
				isCompleted: !!progress?.completedAt,
			}
		} catch (error) {
			console.error('Error getting reading by date:', error)
			throw error
		}
	}

	// Update passage progress
	async updatePassageProgress(userId, dayId, passageIndex, progressData) {
		try {
			const readingDay = await ReadingPlanDay.findById(dayId)
			if (!readingDay) {
				throw new ErrorHandler('Reading day not found', HTTP.NOT_FOUND)
			}

			let progress = await UserReadingProgress.findOne({
				userId,
				planId: readingDay.planId,
				dayId,
			})

			if (!progress) {
				// Create new progress record
				const newProgress = new UserReadingProgress({
					userId,
					planId: readingDay.planId,
					dayId,
					dayNumber: readingDay.dayNumber,
					passagesProgress: [],
				})
				await newProgress.save()
				progress = newProgress
			}

			// Update specific passage progress - only allow completed field
			// Use $addToSet to avoid creating null values in sparse arrays
			const passageProgress = {
				passageIndex,
				completed: progressData.completed || false,
			}

			// First, remove any existing progress for this passage index
			await UserReadingProgress.updateOne(
				{ userId, planId: readingDay.planId, dayId },
				{ $pull: { passagesProgress: { passageIndex } } }
			)

			// Then add the new progress
			await UserReadingProgress.updateOne(
				{ userId, planId: readingDay.planId, dayId },
				{ $push: { passagesProgress: passageProgress } }
			)

			// Get updated progress
			const updatedProgress = await UserReadingProgress.findOne({
				userId,
				planId: readingDay.planId,
				dayId,
			})

			// Clean up any null values in passagesProgress array
			if (updatedProgress?.passagesProgress) {
				const cleanedProgress = updatedProgress.passagesProgress.filter(
					(p) => p !== null
				)
				if (
					cleanedProgress.length !== updatedProgress.passagesProgress.length
				) {
					await UserReadingProgress.updateOne(
						{ userId, planId: readingDay.planId, dayId },
						{ $set: { passagesProgress: cleanedProgress } }
					)
					// Refetch after cleanup
					const cleanedUpdatedProgress = await UserReadingProgress.findOne({
						userId,
						planId: readingDay.planId,
						dayId,
					})
					return cleanedUpdatedProgress
				}
			}

			// Check if all passages are now completed
			const totalPassages = readingDay.passages.length
			const completedPassages =
				updatedProgress?.passagesProgress?.filter((p) => p && p.completed)
					.length || 0

			// If all passages are completed and day is not already completed, auto-complete the day
			if (completedPassages === totalPassages && !updatedProgress.completedAt) {
				// Store the actual completion time (current server time)
				const completionTime = new Date()
				// Store the READING DAY's scheduled date at user's local midnight (as UTC instant)
				// This ensures streaks are based on when the reading was scheduled, not when it was completed
				// This prevents backfilling past plan days from inflating streaks incorrectly
				const readingDayDateString = readingDay.date.toISOString().slice(0, 10) // yyyy-MM-dd
				const { startUtc: readingDayLocalMidnight } =
					await this.getUserDayWindowUtc(userId, readingDayDateString)

				await UserReadingProgress.updateOne(
					{ userId, planId: readingDay.planId, dayId },
					{
						$set: {
							completedAt: completionTime,
							lastStreakDate: readingDayLocalMidnight,
						},
					}
				)

				// Get updated progress
				const completedProgress = await UserReadingProgress.findOne({
					userId,
					planId: readingDay.planId,
					dayId,
				})

				// Calculate streak on-demand (not stored, but included in response)
				const streak = await this.calculateStreak(userId, readingDay.planId)

				// Return progress with calculated streak (for client convenience)
				return {
					...completedProgress.toObject(),
					streakCount: streak, // Include in response but not stored in DB
				}
			}

			return updatedProgress
		} catch (error) {
			console.error('Error updating passage progress:', error)
			throw error
		}
	}

	// Calculate user's current streak
	// Streak Logic:
	// 1. Streak counts consecutive COMPLETED days that were done on the EXACT scheduled date
	// 2. No grace period - completion must happen on the same calendar day as the reading
	// 3. Backfilled readings (past days completed later) do NOT count towards streak
	// 4. If today is completed on time, streak includes today
	// 5. If today is NOT completed, streak starts from yesterday (user still has time today)
	//
	// Examples:
	//   - Day 335 scheduled 1 Dec, completed 1 Dec → counts ✓
	//   - Day 334 scheduled 30 Nov, completed 1 Dec → does NOT count ✗ (backfill)
	//   - Day 333 scheduled 29 Nov, completed 1 Dec → does NOT count ✗ (backfill)
	async calculateStreak(userId, planId) {
		try {
			// Get all completed progress records with their reading day info
			const progress = await UserReadingProgress.find({
				userId,
				planId,
				completedAt: { $ne: null },
			})
				.populate('dayId', 'date')
				.sort({ dayNumber: -1 })

			if (progress.length === 0) return 0

			// Resolve user's timezone and today's date string (YYYY-MM-DD) in their timezone
			const { tz, ymd: todayYmd } = await this.getUserDayWindowUtc(userId)

			// Helper: Convert a Date to YYYY-MM-DD string in user's timezone
			// Using formatInTimeZone for explicit timezone conversion (more reliable than locale)
			const dateToYmd = (date) => {
				if (!date) return null
				return formatInTimeZone(date, tz, 'yyyy-MM-dd')
			}

			// Build a set of completed day keys (YYYY-MM-DD) in user's timezone
			// ONLY include days that were completed "on time" (within 1 day grace period)
			const completedYmdSet = new Set()

			for (const p of progress) {
				// Get the scheduled date for this reading day
				let scheduledYmd
				if (p.lastStreakDate) {
					// lastStreakDate is the reading day's scheduled date at user's local midnight
					scheduledYmd = dateToYmd(new Date(p.lastStreakDate))
				} else if (p.dayId?.date) {
					// Fallback: use the reading day's scheduled date converted to user's timezone
					scheduledYmd = dateToYmd(new Date(p.dayId.date))
				} else {
					// Last resort: use completedAt (should rarely happen)
					scheduledYmd = dateToYmd(new Date(p.completedAt))
				}

				if (!scheduledYmd) continue

				// Get the actual completion date in user's timezone
				const completedAtYmd = dateToYmd(new Date(p.completedAt))

				// Streak only counts if completed on the EXACT scheduled date
				// No grace period - backfilled readings do not count
				const isOnTime = scheduledYmd === completedAtYmd

				// Only add to streak if completed on same day as scheduled
				if (isOnTime) {
					completedYmdSet.add(scheduledYmd)
				}
			}

			// Helper: Get previous day's date string (YYYY-MM-DD) in user's timezone
			const stepBackYmd = (baseYmd) => {
				const baseStartUtc = fromZonedTime(`${baseYmd} 00:00:00`, tz)
				const prevStartUtc = addDays(baseStartUtc, -1)
				return formatInTimeZone(prevStartUtc, tz, 'yyyy-MM-dd')
			}

			// Determine starting point for streak calculation:
			// - If today is completed (on time), start counting from today
			// - If today is NOT completed, start from yesterday (user still has time to complete today)
			let checkYmd = completedYmdSet.has(todayYmd)
				? todayYmd
				: stepBackYmd(todayYmd)

			// Count consecutive completed days backwards from starting point
			let streak = 0
			while (completedYmdSet.has(checkYmd)) {
				streak += 1
				checkYmd = stepBackYmd(checkYmd)
			}

			return streak
		} catch (error) {
			console.error('Error calculating streak:', error)
			return 0
		}
	}

	// Helper function to convert date to user timezone synchronously
	convertToUserTimezoneSync(userTimezone, date) {
		try {
			const userDate = new Date(
				date.toLocaleString('en-US', { timeZone: userTimezone })
			)
			return new Date(
				userDate.getFullYear(),
				userDate.getMonth(),
				userDate.getDate()
			)
		} catch (error) {
			// Fallback to original date
			return new Date(date.getFullYear(), date.getMonth(), date.getDate())
		}
	}

	// Helper function to check if two dates are the same day
	isSameDay(date1, date2) {
		return (
			date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate()
		)
	}

	// Get user's reading statistics
	async getUserStats(userId, planId = null) {
		try {
			if (!planId) {
				// Get user's current year based on their timezone
				const { startUtc } = await this.getUserDayWindowUtc(userId)
				const userYear = new Date(startUtc).getUTCFullYear()

				const activePlan = await ReadingPlan.findOne({
					isActive: true,
					year: userYear,
				})
				planId = activePlan?._id
			}

			const stats = await UserReadingProgress.aggregate([
				{
					$match: {
						userId: mongoose.Types.ObjectId(userId),
						planId: mongoose.Types.ObjectId(planId),
					},
				},
				{
					$group: {
						_id: null,
						totalDaysCompleted: {
							$sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] },
						},
					},
				},
			])

			// Calculate streak on-demand (no longer stored in database)
			const currentStreak = await this.calculateStreak(userId, planId)

			return {
				totalDaysCompleted: stats[0]?.totalDaysCompleted || 0,
				currentStreak,
				longestStreak: currentStreak, // For now, use current streak as longest (can be enhanced later)
			}
		} catch (error) {
			console.error('Error getting user stats:', error)
			throw error
		}
	}

	// Get completed days for calendar display
	async getCompletedDaysForCalendar(userId, planId = null, year = null) {
		try {
			// Get user's preferred plan or default to active plan
			let targetYear = year

			if (!targetYear) {
				// Get user's current year based on their timezone
				const { startUtc } = await this.getUserDayWindowUtc(userId)
				targetYear = new Date(startUtc).getUTCFullYear()
			}

			if (!planId) {
				const activePlan = await ReadingPlan.findOne({
					isActive: true,
					year: targetYear,
				})
				planId = activePlan?._id
			}

			if (!planId) {
				throw new ErrorHandler('No active reading plan found', HTTP.NOT_FOUND)
			}
			const isLeapYear =
				(targetYear % 4 === 0 && targetYear % 100 !== 0) ||
				targetYear % 400 === 0

			// Get the reading plan details
			const plan = await ReadingPlan.findById(planId)
			if (!plan) {
				throw new ErrorHandler('Reading plan not found', HTTP.NOT_FOUND)
			}

			// Get all completed days for this plan using aggregation
			const completedDaysData = await UserReadingProgress.aggregate([
				// Match user's progress for this plan with completed days
				{
					$match: {
						userId: new mongoose.Types.ObjectId(userId),
						planId: new mongoose.Types.ObjectId(planId),
						completedAt: { $exists: true, $ne: null },
					},
				},
				// Lookup the reading day details
				{
					$lookup: {
						from: 'readingplandays',
						localField: 'dayId',
						foreignField: '_id',
						as: 'readingDay',
					},
				},
				// Unwind to get individual day documents
				{ $unwind: '$readingDay' },
				// Project only the fields we need for calendar
				{
					$project: {
						_id: 0,
						dayNumber: '$readingDay.dayNumber',
						date: '$readingDay.date',
						completedAt: '$completedAt',
						planId: 1,
						planName: plan.name,
						totalDaysInPlan: plan.totalDays || 365,
						year: targetYear,
					},
				},
				// Sort by day number
				{ $sort: { dayNumber: 1 } },
			])

			// Handle leap year logic for M'Cheyne plan
			let processedDays = completedDaysData
			if (
				plan.name.toLowerCase().includes('mcheyne') ||
				plan.name.toLowerCase().includes("m'cheyne")
			) {
				// M'Cheyne plan is 365 days, but in leap years we need to handle the extra day
				if (isLeapYear) {
					// In leap year, day 365 should be mapped to the extra day (Dec 31st)
					processedDays = completedDaysData.map((day) => {
						if (day.dayNumber === 365) {
							// Create a special entry for the leap year extra day
							const leapYearDate = new Date(targetYear, 11, 31) // Dec 31st
							return {
								...day,
								date: leapYearDate,
								isLeapYearDay: true,
								originalDayNumber: day.dayNumber,
							}
						}
						return day
					})
				}
			}

			// Add isLeapYear to each day for consistency
			processedDays = processedDays.map((day) => ({
				...day,
				isLeapYear: isLeapYear,
			}))

			// Get all available years from reading plans
			const availableYears = await ReadingPlan.distinct('year', {
				isActive: true,
			}).then((years) => years.sort((a, b) => b - a)) // Sort descending (newest first)

			// Calculate streak on-demand (no longer stored in database)
			const currentStreak = await this.calculateStreak(userId, planId)

			return {
				planId,
				planName: plan.name,
				year: targetYear,
				isLeapYear,
				totalDaysInPlan: plan.totalDays || 365,
				totalCompletedDays: completedDaysData.length,
				streak: currentStreak,
				availableYears, // Years for which reading plans have been created
				// monthlyData: monthlyArray,
				// For backward compatibility, also return flat array
				completedDays: processedDays,
			}
		} catch (error) {
			console.error('Error getting completed days for calendar:', error)
			throw error
		}
	}

	// Get available reading plans
	async getAvailablePlans() {
		try {
			return await ReadingPlan.find({ isActive: true }).sort({
				year: -1,
				name: 1,
			})
		} catch (error) {
			console.error('Error getting available plans:', error)
			throw error
		}
	}

	// Get friends who are reading (have progress in current year's active plan)
	async getFriendsReadingToday(userId, limit = 3, tzOverride = null) {
		try {
			const userObjectId = new Schema.Types.ObjectId(userId)

			// Get current user's campus
			const currentUser = await User.findById(userId).select('campus')
			if (!currentUser) {
				throw new ErrorHandler('User not found', HTTP.NOT_FOUND)
			}

			// Get current year based on user's timezone
			const {
				startUtc: todayStart,
				endUtc: todayEnd,
				ymd,
			} = await this.getUserDayWindowUtc(userId, null, tzOverride)

			const canonicalStartUtc = new Date(`${ymd}T00:00:00.000Z`)
			const userYear = canonicalStartUtc.getUTCFullYear()

			// Get active plan for current year
			const activePlan = await ReadingPlan.findOne({
				isActive: true,
				year: userYear,
			})

			if (!activePlan) {
				return { friends: [], total: 0 }
			}

			const planId = activePlan._id

			// Get blocked users
			// Users that current user blocked (sender is current user, conversationStatus is blocked)
			const usersBlockedByCurrent = await Message.distinct('receiver', {
				sender: userObjectId,
				conversationStatus: 'blocked',
			})

			// Users who blocked current user (receiver is current user, blockedBy is that user)
			const usersWhoBlockedCurrent = await Message.distinct('sender', {
				receiver: userObjectId,
				blockedBy: { $ne: null },
			})

			// Combine all blocked user IDs
			const blockedUserIds = [
				...new Set([
					...usersBlockedByCurrent.map((id) => id.toString()),
					...usersWhoBlockedCurrent.map((id) => id.toString()),
				]),
			]

			// Get users who have chatted with current user
			const chattedUsers = await Message.distinct('receiver', {
				sender: userObjectId,
			})
			const chattedWithUsers = await Message.distinct('sender', {
				receiver: userObjectId,
			})
			const allChattedUserIds = [
				...new Set([
					...chattedUsers.map((id) => id.toString()),
					...chattedWithUsers.map((id) => id.toString()),
				]),
			].filter((id) => id !== userId.toString())

			// Get users from same campus
			const sameCampusUsers = await User.find({
				campus: currentUser.campus,
				_id: { $ne: userObjectId },
				isEnabled: true,
				isDeleted: { $ne: true },
			}).distinct('_id')

			// Combine friend user IDs (chatted OR same campus)
			const friendUserIds = [
				...new Set([
					...allChattedUserIds.map((id) => new mongoose.Types.ObjectId(id)),
					...sameCampusUsers,
				]),
			].filter((id) => !blockedUserIds.includes(id.toString()))

			if (friendUserIds.length === 0) {
				return { friends: [], total: 0 }
			}

			// Find friends who have reading progress in the active plan (any day)
			// Group by userId to get unique friends (a friend may have multiple progress records)
			let friendsWithProgress = await UserReadingProgress.aggregate([
				{
					$match: {
						userId: { $in: friendUserIds },
						planId: planId,
					},
				},
				{
					$group: {
						_id: '$userId',
					},
				},
				{
					$lookup: {
						from: 'users',
						localField: '_id',
						foreignField: '_id',
						as: 'user',
					},
				},
				{
					$unwind: '$user',
				},
				{
					$match: {
						'user.isEnabled': true,
						'user.isDeleted': { $ne: true },
					},
				},
				{
					$project: {
						_id: 0,
						id: { $toString: '$user._id' },
						firstName: '$user.firstName',
						lastName: '$user.lastName',
						image: '$user.image',
					},
				},
			])

			friendsWithProgress = await Promise.all(
				friendsWithProgress.map(async (friend) => ({
					...friend,
					image: await generateObjectUrl(friend.image),
				}))
			)

			// Get total count
			const total = friendsWithProgress.length

			// Apply limit
			const limitedFriends = friendsWithProgress.slice(0, limit)

			return {
				friends: limitedFriends,
				total: total,
			}
		} catch (error) {
			console.error('Error getting friends reading today:', error)
			throw error
		}
	}
}

module.exports = new ReadingPlanService()
