const Badge = require('../../models/common/content/badge_model')
const UserBadges = require('../../models/common/content/user_badges_model')
const { sendNotificationToUser } = require('../expoPushNotification')

const assignBadgeToUser = async (userId, badgeId, sendNotification = false) => {
	try {
		// Step 1: Find the badge by its ID from the Badge collection
		const badge = await Badge.findById(badgeId)

		// Check if the badge exists, log and return if not found
		if (!badge) {
			console.log(`Badge ${badgeId} not found`)
			return
		}

		// Step 2: Check if the user has already earned this badge
		// Find if the user already has a record for this badge in the UserBadges collection
		let userBadge = await UserBadges.findOne({
			user: userId,
			badge: badge._id,
		})

		if (userBadge) {
			// If the badge is repeatable, update the record to increment timesEarned and update the lastEarned timestamp
			if (badge.isRepeatable) {
				userBadge.timesEarned += 1
				userBadge.lastEarned = new Date()
				userBadge.seen = false
				await userBadge.save()
				console.log(`Badge ${badgeId} re-earned by user ${userId}`)
				if (sendNotification) {
					sendNotificationToUser({
						userId,
						notificationKey: 'newBadgeEarned',
						variables: {
							badgeName: badge.name,
						},
					})
				}
			} else {
				// If the badge is not repeatable and already earned, log that no action is taken
				console.log(`Badge ${badgeId} is non-repeatable and already earned`)
			}
		} else {
			// Step 3: If the user hasn't earned the badge yet, create a new record in UserBadges
			// Record the date it was earned and set timesEarned to 1
			await UserBadges.create({
				user: userId,
				badge: badge._id,
				earnedAt: new Date(),
				timesEarned: 1,
				lastEarned: new Date(),
				seen: false,
			})
			console.log(`Badge ${badgeId} assigned to user ${userId}`)

			if (sendNotification) {
				sendNotificationToUser({
					userId,
					notificationKey: 'newBadgeEarned',
					variables: {
						badgeName: badge.name,
					},
				})
			}
		}
	} catch (error) {
		// Step 4: Catch any errors that occur and log them
		console.error(`Error assigning badge ${badgeId} to user ${userId}:`, error)
	}
}

const hasBadgeBeenAwarded = async (userId, badgeId) => {
	const badge = await UserBadges.findOne({ user: userId, badge: badgeId })
	return !!badge
}

module.exports = {
	assignBadgeToUser,
	hasBadgeBeenAwarded,
}
