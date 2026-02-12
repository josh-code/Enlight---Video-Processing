const Badge = require('../../../../models/common/content/badge_model')
const auth = require('../../../../middleware/auth')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const UserBadges = require('../../../../models/common/content/user_badges_model')
const clientTypeMiddleware = require('../../../../middleware/clientTypeMiddleware')
const featureFlagMiddleware = require('../../../../middleware/featureFlag')
const sendResponse = require('../../../../utils/sendResponse')
const HTTP = require('../../../../constants/httpStatus')

const router = require('express').Router()

// Get all the badges
router.get(
	'/get-all-badges',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const badges = await Badge.find().sort({ createdAt: -1 }).lean()
		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'All badges retrieved successfully',
			data: badges,
		})
	})
)

// Get user badges
router.get(
	'/get-my-badges',
	// clientTypeMiddleware,
	// featureFlagMiddleware({
	//     webPath: "badgesPage",
	//     mobilePath: "myBadgesScreen",
	// }),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user?._id

		// Step 1: Fetch all badges from the Badge collection
		const allBadges = await Badge.find().lean()

		// Step 2: Fetch the user's earned badges from the UserBadges collection
		const userBadges = await UserBadges.find({ user: userId })
			.populate('badge')
			.lean()

		// Step 3: Create a map of earned badges with badge ID as the key
		const earnedBadgesMap = userBadges.reduce((map, userBadge) => {
			map[userBadge.badge._id.toString()] = userBadge
			return map
		}, {})

		// Step 4: Merge the badges and mark them as earned or not earned
		const badgeList = allBadges.map((badge) => {
			const earnedBadge = earnedBadgesMap[badge._id.toString()]
			return {
				...badge,
				earned: !!earnedBadge,
				timesEarned: earnedBadge ? earnedBadge.timesEarned : 0,
				earnedAt: earnedBadge ? earnedBadge.earnedAt : null,
				lastEarned: earnedBadge ? earnedBadge.lastEarned : null,
			}
		})

		// Step 5: Sort badges - Earned badges first, then unearned badges
		badgeList.sort((a, b) => {
			// Grouping earned badges first
			if (a.earned && !b.earned) return -1
			if (!a.earned && b.earned) return 1

			// If both are earned, sort by earnedAt date (earlier first)
			if (a.earned && b.earned) {
				return new Date(a.earnedAt) - new Date(b.earnedAt)
			}

			// No change if neither badge is earned
			return 0
		})

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'User badges retrieved successfully',
			data: badgeList,
		})
	})
)

// Get unseen badges
router.get(
	'/get-unseen-badges',
	// clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'unseenEarnedBadgeModal',
		mobilePath: 'unseenEarnedBadgeModal',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user?._id
		const unseenBadges = await UserBadges.find({ user: userId, seen: false })
			.populate('badge')
			.lean()
		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Unseen badges retrieved successfully',
			data: unseenBadges,
		})
	})
)

// Update seen badges
router.put(
	'/update-seen-badges',
	// clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'unseenEarnedBadgeModal',
		mobilePath: 'unseenEarnedBadgeModal',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user?._id
		const { badgeIds } = req.body

		// Update the badges to mark them as seen
		await UserBadges.updateMany(
			{ user: userId, badge: { $in: badgeIds } },
			{ $set: { seen: true } }
		)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'All badges marked as seen',
			data: null,
		})
	})
)

module.exports = router
