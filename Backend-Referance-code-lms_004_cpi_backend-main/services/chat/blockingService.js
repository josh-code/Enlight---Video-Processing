const UserBlock = require('../../models/common/user_block_model')
const UserReport = require('../../models/common/user_report_model')
const { User } = require('../../models/app/user_model')

/**
 * Enhanced Blocking Service
 * Handles both user-to-user and admin blocking
 */

/**
 * Check if user A is blocked by user B
 * @param {string} blockerId - ID of the user who might have blocked
 * @param {string} blockedUserId - ID of the user who might be blocked
 * @returns {Promise<boolean>} - True if blocked, false otherwise
 */
async function isUserBlocked(blockerId, blockedUserId) {
	try {
		const block = await UserBlock.findOne({
			blocker: blockerId,
			blockedUser: blockedUserId,
			isActive: true,
		})
		return !!block
	} catch (error) {
		console.error('Error checking if user is blocked:', error)
		return false
	}
}

/**
 * Check if there's any active block between two users (either direction)
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<Object|null>} - Block object if exists, null otherwise
 */
async function getActiveBlockBetweenUsers(userId1, userId2) {
	try {
		const block = await UserBlock.findOne({
			$or: [
				{ blocker: userId1, blockedUser: userId2, isActive: true },
				{ blocker: userId2, blockedUser: userId1, isActive: true },
			],
		})
		return block
	} catch (error) {
		console.error('Error checking active block between users:', error)
		return null
	}
}

/**
 * Check if a user is admin-blocked from chat
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} - True if admin-blocked, false otherwise
 */
async function isUserAdminBlocked(userId) {
	try {
		const report = await UserReport.findOne({
			reportedUser: userId,
			chatBlockStatus: 'blocked',
		})
		return !!report
	} catch (error) {
		console.error('Error checking admin block:', error)
		return false
	}
}

/**
 * Check if two users can communicate
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<Object>} - { canCommunicate: boolean, reason: string }
 */
async function canCommunicate(userId1, userId2) {
	try {
		// Check if either user is admin-blocked
		const user1AdminBlocked = await isUserAdminBlocked(userId1)
		const user2AdminBlocked = await isUserAdminBlocked(userId2)

		if (user1AdminBlocked || user2AdminBlocked) {
			return {
				canCommunicate: false,
				reason: 'admin_blocked',
				blockedUser: user1AdminBlocked ? userId1 : userId2,
			}
		}

		// Check if there's a user-to-user block
		const activeBlock = await getActiveBlockBetweenUsers(userId1, userId2)
		if (activeBlock) {
			return {
				canCommunicate: false,
				reason: 'user_blocked',
				blockedBy: activeBlock.blocker.toString(),
				blockedUser:
					activeBlock.blocker.toString() === userId1 ? userId2 : userId1,
			}
		}

		return { canCommunicate: true, reason: null }
	} catch (error) {
		console.error('Error checking if users can communicate:', error)
		return { canCommunicate: false, reason: 'error' }
	}
}

/**
 * Block a user (user-to-user block)
 * @param {string} blockerId - User ID who is blocking
 * @param {string} blockedUserId - User ID to block
 * @param {string} reason - Optional reason
 * @returns {Promise<Object>} - Created/updated block object
 */
async function blockUser(blockerId, blockedUserId, reason = '') {
	try {
		const userBlock = await UserBlock.findOneAndUpdate(
			{ blocker: blockerId, blockedUser: blockedUserId },
			{
				isActive: true,
				blockedAt: new Date(),
				unblockedAt: null,
				unblockedBy: null,
				blockType: 'user',
				blockReason: reason,
			},
			{ upsert: true, new: true }
		)

		return userBlock
	} catch (error) {
		console.error('Error blocking user:', error)
		throw error
	}
}

/**
 * Unblock a user (user-to-user unblock)
 * @param {string} unblockerId - User ID who is unblocking
 * @param {string} unblockedUserId - User ID to unblock
 * @returns {Promise<Object|null>} - Updated block object or null if not found
 */
async function unblockUser(unblockerId, unblockedUserId) {
	try {
		const userBlock = await UserBlock.findOne({
			blocker: unblockerId,
			blockedUser: unblockedUserId,
			isActive: true,
		})

		if (!userBlock) {
			return null
		}

		userBlock.isActive = false
		userBlock.unblockedAt = new Date()
		userBlock.unblockedBy = unblockerId
		await userBlock.save()

		return userBlock
	} catch (error) {
		console.error('Error unblocking user:', error)
		throw error
	}
}

/**
 * Admin block a user globally
 * @param {string} adminId - Admin user ID
 * @param {string} userId - User ID to block
 * @param {string} reason - Reason for blocking
 * @returns {Promise<Object>} - Updated UserReport
 */
async function adminBlockUser(adminId, userId, reason = '') {
	try {
		// Update all reports involving this user
		const updateResult = await UserReport.updateMany(
			{ reportedUser: userId },
			{
				chatBlockStatus: 'blocked',
				chatBlockedBy: adminId,
				chatBlockedAt: new Date(),
				chatBlockReason: reason || 'Blocked from chat by admin',
			}
		)

		// Create or update UserBlock entries for all conversations involving this user
		// Find all users who have conversations with this user
		const Message = require('../../models/common/messages_model')
		const messages = await Message.find({
			$or: [{ sender: userId }, { receiver: userId }],
		}).distinct('sender receiver')

		const userIds = [...new Set(messages.flat())].filter(
			(id) => id.toString() !== userId
		)

		// Create admin blocks for all affected users
		for (const otherUserId of userIds) {
			await UserBlock.findOneAndUpdate(
				{ blocker: otherUserId, blockedUser: userId },
				{
					isActive: true,
					blockedAt: new Date(),
					unblockedAt: null,
					unblockedBy: null,
					blockType: 'admin',
					blockReason: reason || 'Blocked from chat by admin',
					blockedByAdmin: adminId,
				},
				{ upsert: true, new: true }
			)
		}

		return {
			affectedReports: updateResult.modifiedCount,
			affectedUsers: userIds.length,
		}
	} catch (error) {
		console.error('Error admin blocking user:', error)
		throw error
	}
}

/**
 * Admin unblock a user globally
 * @param {string} adminId - Admin user ID
 * @param {string} userId - User ID to unblock
 * @returns {Promise<Object>} - Update result
 */
async function adminUnblockUser(adminId, userId) {
	try {
		// Update all reports involving this user
		const updateResult = await UserReport.updateMany(
			{ reportedUser: userId },
			{
				chatBlockStatus: 'none',
				chatBlockedBy: null,
				chatBlockedAt: null,
				chatBlockReason: '',
			}
		)

		// Deactivate all admin UserBlock entries for this user
		const deactivateResult = await UserBlock.updateMany(
			{
				blockedUser: userId,
				blockType: 'admin',
				isActive: true,
			},
			{
				isActive: false,
				unblockedAt: new Date(),
				unblockedBy: adminId,
			}
		)

		return {
			affectedReports: updateResult.modifiedCount,
			affectedBlocks: deactivateResult.modifiedCount,
		}
	} catch (error) {
		console.error('Error admin unblocking user:', error)
		throw error
	}
}

/**
 * Get all users blocked by a specific user
 * @param {string} userId - ID of the user
 * @returns {Promise<Array>} - Array of blocked user info
 */
async function getBlockedUsers(userId) {
	try {
		const blocks = await UserBlock.find({
			blocker: userId,
			isActive: true,
		}).populate('blockedUser', 'firstName lastName image isDeleted isEnabled')

		return blocks.map((block) => ({
			userId: block.blockedUser._id,
			firstName: block.blockedUser.firstName,
			lastName: block.blockedUser.lastName,
			image: block.blockedUser.image,
			blockedAt: block.blockedAt,
			blockType: block.blockType,
			blockReason: block.blockReason,
		}))
	} catch (error) {
		console.error('Error getting blocked users:', error)
		return []
	}
}

/**
 * Get all users who have blocked a specific user
 * @param {string} userId - ID of the user
 * @returns {Promise<Array>} - Array of blocker user info
 */
async function getBlockers(userId) {
	try {
		const blocks = await UserBlock.find({
			blockedUser: userId,
			isActive: true,
		}).populate('blocker', 'firstName lastName image isDeleted isEnabled')

		return blocks.map((block) => ({
			userId: block.blocker._id,
			firstName: block.blocker.firstName,
			lastName: block.blocker.lastName,
			image: block.blocker.image,
			blockedAt: block.blockedAt,
			blockType: block.blockType,
		}))
	} catch (error) {
		console.error('Error getting blockers:', error)
		return []
	}
}

/**
 * Sanitize user info based on blocking status
 * @param {Object} user - User object
 * @param {string} requesterId - User ID requesting the info
 * @returns {Promise<Object>} - Sanitized user object
 */
async function sanitizeUserInfo(user, requesterId) {
	if (!user || user.isDeleted || !user.isEnabled) {
		return {
			_id: user?._id,
			name: 'Deleted User',
			firstName: 'Deleted',
			lastName: 'User',
			image: null,
			isDeleted: true,
		}
	}

	// Check if users can communicate
	const communicationCheck = await canCommunicate(
		requesterId,
		user._id.toString()
	)
	if (!communicationCheck.canCommunicate) {
		const result = {
			_id: user._id,
			name: 'User',
			firstName: 'User',
			lastName: '',
			image: null,
			isBlocked: true,
		}

		if (communicationCheck.reason === 'admin_blocked') {
			result.isAdminBlocked = true
		}

		return result
	}

	// Return full user info
	return {
		_id: user._id,
		firstName: user.firstName,
		lastName: user.lastName,
		name: user.name,
		image: user.image,
		isDeleted: false,
		isBlocked: false,
	}
}

module.exports = {
	isUserBlocked,
	getActiveBlockBetweenUsers,
	isUserAdminBlocked,
	canCommunicate,
	blockUser,
	unblockUser,
	adminBlockUser,
	adminUnblockUser,
	getBlockedUsers,
	getBlockers,
	sanitizeUserInfo,
}
