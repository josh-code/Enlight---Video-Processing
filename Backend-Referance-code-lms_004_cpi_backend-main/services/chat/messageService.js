const Message = require('../../models/common/messages_model')
const Conversation = require('../../models/common/conversation_model')
const conversationService = require('./conversationService')
const blockingService = require('./blockingService')
const socketEmitter = require('./socketEmitter')
const { sendNotificationToUser } = require('../expoPushNotification')
const { User } = require('../../models/app/user_model')

/**
 * Message Service
 * Handles message CRUD and delivery
 */

/**
 * Send a message
 * @param {string} conversationId - Conversation ID (optional, will be created if not provided)
 * @param {string} senderId - Sender user ID
 * @param {string} receiverId - Receiver user ID (for direct messages)
 * @param {string} content - Message content
 * @param {string} type - Message type (text, system, image, video, file)
 * @param {Object} media - Media object (optional)
 * @returns {Promise<Object>} - Created message
 */
async function sendMessage(
	conversationId,
	senderId,
	receiverId,
	content,
	type = 'text',
	media = null
) {
	try {
		// Check if users can communicate
		const canComm = await blockingService.canCommunicate(senderId, receiverId)
		if (!canComm.canCommunicate) {
			throw new Error(
				canComm.reason === 'admin_blocked'
					? 'Cannot send message. User is not available for chat.'
					: 'Cannot send message. User is blocked.'
			)
		}

		// Find or create conversation if not provided
		let convId = conversationId
		if (!convId) {
			const conversation =
				await conversationService.findOrCreateDirectConversation(
					senderId,
					receiverId
				)
			convId = conversation._id.toString()
		}

		// Create message
		const message = new Message({
			conversation: convId,
			sender: senderId,
			receiver: receiverId, // Keep for backward compatibility
			content: content,
			message: content, // Keep for backward compatibility
			type,
			media: media || undefined,
		})

		await message.save()

		// Update conversation's last message
		await conversationService.updateLastMessage(convId, message)

		// Emit socket event
		socketEmitter.emitMessageSent(message, convId)

		// Send push notification if receiver is offline
		const { getOnlineUsers } = require('../socket')
		const onlineUsers = getOnlineUsers()
		if (!onlineUsers[receiverId]) {
			try {
				const sender = await User.findById(senderId)
				const senderName = sender.firstName
					? `${sender.firstName} ${sender.lastName}`
					: (sender.phonePin || '') + (sender.phone || 'User')

				await sendNotificationToUser({
					userId: receiverId,
					notificationKey: 'newMessage',
					variables: { senderName },
				})
			} catch (err) {
				console.error('Error sending message notification:', err)
			}
		}

		// Emit conversation list updates
		const senderConversations =
			await conversationService.getConversationsForUser(senderId)
		const receiverConversations =
			await conversationService.getConversationsForUser(receiverId)

		socketEmitter.emitConversationListUpdate(senderId, senderConversations)
		socketEmitter.emitConversationListUpdate(receiverId, receiverConversations)

		return message
	} catch (error) {
		console.error('Error sending message:', error)
		throw error
	}
}

/**
 * Get messages for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Query options (limit, skip, before)
 * @returns {Promise<Array>} - Array of messages
 */
async function getMessages(conversationId, options = {}) {
	try {
		const { limit = 50, skip = 0, before = null } = options

		const query = {
			conversation: conversationId,
			isDeleted: false,
		}

		if (before) {
			query.createdAt = { $lt: new Date(before) }
		}

		const messages = await Message.find(query)
			.populate('sender', 'firstName lastName image')
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(skip)
			.lean()

		return messages.reverse() // Return in chronological order
	} catch (error) {
		console.error('Error getting messages:', error)
		throw error
	}
}

/**
 * Mark messages as read
 * @param {Array<string>} messageIds - Message IDs
 * @param {string} userId - User ID who read
 * @returns {Promise<Object>} - Update result
 */
async function markAsRead(messageIds, userId) {
	try {
		const messages = await Message.find({
			_id: { $in: messageIds },
			isDeleted: false,
		}).populate('conversation')

		const updatedMessages = []
		const conversationIds = new Set()

		for (const message of messages) {
			// Check if already read by this user
			const alreadyRead = message.readBy?.some(
				(r) => r.userId.toString() === userId
			)

			if (!alreadyRead) {
				message.readBy = message.readBy || []
				message.readBy.push({
					userId,
					readAt: new Date(),
				})
				message.isRead = true // Legacy field
				await message.save()
				updatedMessages.push(message._id)

				if (message.conversation) {
					conversationIds.add(message.conversation.toString())
				}
			}
		}

		// Update conversation unread counts
		for (const convId of conversationIds) {
			await conversationService.markConversationRead(convId, userId)
		}

		// Emit socket events
		for (const convId of conversationIds) {
			socketEmitter.emitMessageRead(convId, userId, updatedMessages)
		}

		return {
			updatedCount: updatedMessages.length,
			messageIds: updatedMessages,
		}
	} catch (error) {
		console.error('Error marking messages as read:', error)
		throw error
	}
}

/**
 * Mark messages as delivered
 * @param {Array<string>} messageIds - Message IDs
 * @param {string} userId - User ID who received
 * @returns {Promise<Object>} - Update result
 */
async function markAsDelivered(messageIds, userId) {
	try {
		const messages = await Message.find({
			_id: { $in: messageIds },
			isDeleted: false,
		}).populate('conversation')

		const updatedMessages = []
		const conversationIds = new Set()

		for (const message of messages) {
			// Check if already delivered to this user
			const alreadyDelivered = message.deliveredTo?.some(
				(d) => d.userId.toString() === userId
			)

			if (!alreadyDelivered) {
				message.deliveredTo = message.deliveredTo || []
				message.deliveredTo.push({
					userId,
					deliveredAt: new Date(),
				})
				await message.save()
				updatedMessages.push(message._id)

				if (message.conversation) {
					conversationIds.add(message.conversation.toString())
				}
			}
		}

		// Emit socket events
		for (const convId of conversationIds) {
			socketEmitter.emitMessageDelivered(convId, userId, updatedMessages)
		}

		return {
			updatedCount: updatedMessages.length,
			messageIds: updatedMessages,
		}
	} catch (error) {
		console.error('Error marking messages as delivered:', error)
		throw error
	}
}

/**
 * Delete a message (soft delete)
 * @param {string} messageId - Message ID
 * @param {string} userId - User ID who is deleting
 * @returns {Promise<Object>} - Deleted message
 */
async function deleteMessage(messageId, userId) {
	try {
		const message = await Message.findById(messageId)
		if (!message) {
			throw new Error('Message not found')
		}

		// Only sender can delete
		if (message.sender.toString() !== userId) {
			throw new Error('Only the sender can delete this message')
		}

		message.isDeleted = true
		message.deletedAt = new Date()
		message.deletedBy = userId
		await message.save()

		// Emit socket event
		if (message.conversation) {
			socketEmitter.emitMessageDeleted(
				messageId,
				message.conversation.toString()
			)
		}

		return message
	} catch (error) {
		console.error('Error deleting message:', error)
		throw error
	}
}

/**
 * Create a system message
 * @param {string} conversationId - Conversation ID
 * @param {string} action - System action type
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Created system message
 */
async function createSystemMessage(conversationId, action, metadata = {}) {
	try {
		const conversation = await Conversation.findById(conversationId)
		if (!conversation) {
			throw new Error('Conversation not found')
		}

		// Determine system message content based on action
		const systemMessages = {
			user_blocked: 'User blocked this conversation',
			user_unblocked: 'User unblocked this conversation',
			admin_blocked: 'This conversation has been blocked by an administrator',
			admin_unblocked: 'This conversation has been unblocked',
			conversation_accepted: 'Conversation accepted',
		}

		const content = systemMessages[action] || 'System message'

		const message = new Message({
			conversation: conversationId,
			sender: conversation.participants[0], // Use first participant as sender
			type: 'system',
			content,
			systemAction: action,
		})

		await message.save()

		// Update conversation's last message
		await conversationService.updateLastMessage(conversationId, message)

		// Emit socket event
		socketEmitter.emitMessageSent(message, conversationId)

		return message
	} catch (error) {
		console.error('Error creating system message:', error)
		throw error
	}
}

module.exports = {
	sendMessage,
	getMessages,
	markAsRead,
	markAsDelivered,
	deleteMessage,
	createSystemMessage,
}
