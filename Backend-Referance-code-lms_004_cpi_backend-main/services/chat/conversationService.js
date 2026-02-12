const Conversation = require('../../models/common/conversation_model')
const Message = require('../../models/common/messages_model')
const { User } = require('../../models/app/user_model')
const { generateObjectUrl } = require('../aws/utils')
const blockingService = require('./blockingService')
const chatCacheService = require('./chatCacheService')
const socketEmitter = require('./socketEmitter')

/**
 * Conversation Service
 * Handles conversation CRUD and queries
 */

/**
 * Find or create a direct conversation between two users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<Object>} - Conversation object
 */
async function findOrCreateDirectConversation(userId1, userId2) {
	try {
		// Ensure consistent ordering for unique index
		const participants = [userId1, userId2].sort()

		// Try to find existing conversation
		let conversation = await Conversation.findOne({
			participants: { $all: participants },
			type: 'direct',
		})

		if (!conversation) {
			// Create new conversation
			conversation = await Conversation.create({
				participants,
				type: 'direct',
				status: 'pending',
				unreadCounts: new Map(),
			})
		}

		return conversation
	} catch (error) {
		console.error('Error finding/creating conversation:', error)
		throw error
	}
}

/**
 * Get conversations for a user (replaces getUpdatedChats)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of conversation objects with user info
 */
async function getConversationsForUser(userId) {
	try {
		if (!userId) return []

		// Check cache first
		const cached = chatCacheService.getCachedConversations(userId)
		if (cached) return cached

		// Find all conversations where user is a participant
		const conversations = await Conversation.find({
			participants: userId,
			$or: [
				{ 'deletedFor.userId': { $ne: userId } },
				{ deletedFor: { $size: 0 } },
			],
		})
			.populate('participants', 'firstName lastName image isDeleted isEnabled')
			.populate('lastMessage.senderId', 'firstName lastName')
			.sort({ 'lastMessage.sentAt': -1, updatedAt: -1 })
			.lean()

		// Process conversations and add user info
		const processedConversations = await Promise.all(
			conversations.map(async (conv) => {
				// Get the other participant (for direct conversations)
				const otherParticipant = conv.participants.find(
					(p) => p._id.toString() !== userId
				)

				if (!otherParticipant) {
					return null
				}

				// Sanitize user info based on blocking
				const sanitizedUser = await blockingService.sanitizeUserInfo(
					otherParticipant,
					userId
				)

				// Get unread count for this user
				const unreadCount =
					conv.unreadCounts && conv.unreadCounts.get
						? conv.unreadCounts.get(userId) || 0
						: 0

				// Process image URL if available
				if (sanitizedUser.image) {
					sanitizedUser.image = await generateObjectUrl(sanitizedUser.image)
				}

				return {
					conversationId: conv._id,
					chatUser: sanitizedUser,
					lastMessage:
						conv.lastMessage?.content || conv.lastMessage?.message || '',
					lastMessageDate: conv.lastMessage?.sentAt || conv.updatedAt,
					unreadCount,
					status: conv.status,
					type: conv.type,
				}
			})
		)

		// Filter out null entries
		const filtered = processedConversations.filter((c) => c !== null)

		// Cache the result
		chatCacheService.setCachedConversations(userId, filtered)

		return filtered
	} catch (error) {
		console.error('Error getting conversations for user:', error)
		return []
	}
}

/**
 * Update conversation's last message
 * @param {string} conversationId - Conversation ID
 * @param {Object} message - Message object
 * @returns {Promise<Object>} - Updated conversation
 */
async function updateLastMessage(conversationId, message) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		// Update last message
		conversation.lastMessage = {
			messageId: message._id,
			content: message.content || message.message || '',
			senderId: message.sender,
			sentAt: message.createdAt || new Date(),
		}

		// Increment unread count for all participants except sender
		const senderId = message.sender.toString()
		conversation.participants.forEach((participantId) => {
			const participantStr = participantId.toString()
			if (participantStr !== senderId) {
				const currentCount = conversation.unreadCounts.get(participantStr) || 0
				conversation.unreadCounts.set(participantStr, currentCount + 1)
			}
		})

		await conversation.save()

		// Invalidate cache for all participants
		const participantIds = conversation.participants.map((p) => p.toString())
		chatCacheService.invalidateCacheForUsers(...participantIds)

		return conversation
	} catch (error) {
		console.error('Error updating last message:', error)
		throw error
	}
}

/**
 * Mark conversation as read for a user
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Updated conversation
 */
async function markConversationRead(conversationId, userId) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		// Reset unread count for this user
		conversation.unreadCounts.set(userId, 0)
		await conversation.save()

		// Invalidate cache
		chatCacheService.invalidateCache(userId)

		return conversation
	} catch (error) {
		console.error('Error marking conversation as read:', error)
		throw error
	}
}

/**
 * Block a conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} blockerId - User ID who is blocking
 * @returns {Promise<Object>} - Updated conversation
 */
async function blockConversation(conversationId, blockerId) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		conversation.status = 'blocked'
		conversation.blockedBy = blockerId
		conversation.blockedAt = new Date()
		await conversation.save()

		// Invalidate cache for all participants
		const participantIds = conversation.participants.map((p) => p.toString())
		chatCacheService.invalidateCacheForUsers(...participantIds)

		// Emit socket event
		socketEmitter.emitConversationBlocked(conversationId, blockerId)

		return conversation
	} catch (error) {
		console.error('Error blocking conversation:', error)
		throw error
	}
}

/**
 * Unblock a conversation
 * @param {string} conversationId - Conversation ID
 * @param {string} unblockerId - User ID who is unblocking
 * @returns {Promise<Object>} - Updated conversation
 */
async function unblockConversation(conversationId, unblockerId) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		// Only allow unblocking if the user who blocked is unblocking
		if (conversation.blockedBy?.toString() !== unblockerId) {
			throw new Error('Only the user who blocked can unblock')
		}

		conversation.status = 'active'
		conversation.blockedBy = null
		conversation.blockedAt = null
		await conversation.save()

		// Invalidate cache for all participants
		const participantIds = conversation.participants.map((p) => p.toString())
		chatCacheService.invalidateCacheForUsers(...participantIds)

		// Emit socket event
		socketEmitter.emitConversationUnblocked(conversationId)

		return conversation
	} catch (error) {
		console.error('Error unblocking conversation:', error)
		throw error
	}
}

/**
 * Delete conversation for a user (soft delete)
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Updated conversation
 */
async function deleteConversationForUser(conversationId, userId) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		// Add to deletedFor array if not already there
		const alreadyDeleted = conversation.deletedFor.some(
			(d) => d.userId.toString() === userId
		)

		if (!alreadyDeleted) {
			conversation.deletedFor.push({
				userId,
				deletedAt: new Date(),
			})
			await conversation.save()
		}

		// Invalidate cache
		chatCacheService.invalidateCache(userId)

		return conversation
	} catch (error) {
		console.error('Error deleting conversation for user:', error)
		throw error
	}
}

/**
 * Accept a conversation (change status from pending to active)
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID accepting
 * @returns {Promise<Object>} - Updated conversation
 */
async function acceptConversation(conversationId, userId) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		// Verify user is a participant
		const isParticipant = conversation.participants.some(
			(p) => p.toString() === userId
		)
		if (!isParticipant) {
			throw new Error('User is not a participant in this conversation')
		}

		conversation.status = 'active'
		await conversation.save()

		// Invalidate cache for all participants
		const participantIds = conversation.participants.map((p) => p.toString())
		chatCacheService.invalidateCacheForUsers(...participantIds)

		// Emit socket event
		const participantIdsArray = conversation.participants.map((p) =>
			p.toString()
		)
		socketEmitter.emitConversationUpdated(userId, conversation)
		participantIdsArray.forEach((pid) => {
			if (pid !== userId) {
				socketEmitter.emitConversationUpdated(pid, conversation)
			}
		})

		return conversation
	} catch (error) {
		console.error('Error accepting conversation:', error)
		throw error
	}
}

module.exports = {
	findOrCreateDirectConversation,
	getConversationsForUser,
	updateLastMessage,
	markConversationRead,
	blockConversation,
	unblockConversation,
	deleteConversationForUser,
	acceptConversation,
}
