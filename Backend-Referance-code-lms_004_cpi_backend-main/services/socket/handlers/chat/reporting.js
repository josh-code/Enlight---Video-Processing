const UserReport = require('../../../../models/common/user_report_model')
const Message = require('../../../../models/common/messages_model')
const { User } = require('../../../../models/app/user_model')
const blockingService = require('../../../chat/blockingService')
const conversationService = require('../../../chat/conversationService')
const { SOCKET_EVENTS, SOCKET_LISTENERS } = require('../../events')
const { emitToUser } = require('../../index')

/**
 * Reporting Handlers
 * Handle user reporting and blocking
 */

/**
 * Register reporting handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {SocketIO.Socket} socket - Socket instance
 * @param {Object} onlineUsers - Online users map
 */
function registerReportingHandlers(io, socket, onlineUsers) {
	// Report user
	socket.on(SOCKET_LISTENERS.USER.REPORT, async (data) => {
		try {
			const { reporterId, reportedUserId, reason, comment } = data

			if (!reporterId || !reportedUserId || !reason) {
				return socket.emit('report user response', {
					success: false,
					message: 'Missing required fields',
				})
			}

			// Check if user exists and is not deleted
			const reportedUser = await User.findById(reportedUserId)
			if (!reportedUser || reportedUser.isDeleted || !reportedUser.isEnabled) {
				return socket.emit('report user response', {
					success: false,
					message: 'User not found or inactive',
				})
			}

			// Get last 5 messages between users for context
			const conversation =
				await conversationService.findOrCreateDirectConversation(
					reporterId,
					reportedUserId
				)

			const contextMessages = await Message.find({
				conversation: conversation._id,
			})
				.sort({ createdAt: -1 })
				.limit(5)
				.select('sender content message createdAt')
				.populate('sender', 'firstName lastName')

			// Create the report
			const report = new UserReport({
				reporter: reporterId,
				reportedUser: reportedUserId,
				reason,
				comment: comment || '',
				contextMessages: contextMessages.map((msg) => ({
					sender: msg.sender._id,
					message: msg.content || msg.message,
					createdAt: msg.createdAt,
				})),
			})

			await report.save()

			socket.emit('report user response', {
				success: true,
				message: 'User reported successfully',
			})

			console.log(
				`User ${reporterId} reported user ${reportedUserId} for ${reason}`
			)
		} catch (error) {
			console.error('Error reporting user:', error)
			socket.emit('report user response', {
				success: false,
				message: 'Failed to report user',
			})
		}
	})

	// Block user
	socket.on(SOCKET_LISTENERS.USER.BLOCK, async (data) => {
		try {
			const { blockerId, blockedUserId } = data

			if (!blockerId || !blockedUserId) {
				return socket.emit('block user response', {
					success: false,
					message: 'Missing required fields',
				})
			}

			// Check if user exists
			const blockedUser = await User.findById(blockedUserId)
			if (!blockedUser || blockedUser.isDeleted || !blockedUser.isEnabled) {
				return socket.emit('block user response', {
					success: false,
					message: 'User not found or inactive',
				})
			}

			// Block user
			await blockingService.blockUser(blockerId, blockedUserId)

			// Update conversation status
			const conversation =
				await conversationService.findOrCreateDirectConversation(
					blockerId,
					blockedUserId
				)
			await conversationService.blockConversation(
				conversation._id.toString(),
				blockerId
			)

			// Update conversation lists
			const blockerConversations =
				await conversationService.getConversationsForUser(blockerId)
			const blockedUserConversations =
				await conversationService.getConversationsForUser(blockedUserId)

			emitToUser(
				blockerId,
				SOCKET_EVENTS.CONVERSATION.LIST(blockerId),
				blockerConversations
			)
			emitToUser(
				blockedUserId,
				SOCKET_EVENTS.CONVERSATION.LIST(blockedUserId),
				blockedUserConversations
			)

			socket.emit('block user response', {
				success: true,
				message: 'User blocked successfully',
			})
		} catch (error) {
			console.error('Error blocking user:', error)
			socket.emit('block user response', {
				success: false,
				message: error.message || 'Failed to block user',
			})
		}
	})

	// Unblock user
	socket.on(SOCKET_LISTENERS.USER.UNBLOCK, async (data) => {
		try {
			const { unblockerId, unblockedUserId } = data

			if (!unblockerId || !unblockedUserId) {
				return socket.emit('unblock user response', {
					success: false,
					message: 'Missing required fields',
				})
			}

			// Unblock user
			const userBlock = await blockingService.unblockUser(
				unblockerId,
				unblockedUserId
			)

			if (!userBlock) {
				return socket.emit('unblock user response', {
					success: false,
					message: 'User is not blocked',
				})
			}

			// Update conversation status
			const conversation =
				await conversationService.findOrCreateDirectConversation(
					unblockerId,
					unblockedUserId
				)
			await conversationService.unblockConversation(
				conversation._id.toString(),
				unblockerId
			)

			// Update conversation lists
			const unblockerConversations =
				await conversationService.getConversationsForUser(unblockerId)
			const unblockedUserConversations =
				await conversationService.getConversationsForUser(unblockedUserId)

			emitToUser(
				unblockerId,
				SOCKET_EVENTS.CONVERSATION.LIST(unblockerId),
				unblockerConversations
			)
			emitToUser(
				unblockedUserId,
				SOCKET_EVENTS.CONVERSATION.LIST(unblockedUserId),
				unblockedUserConversations
			)

			socket.emit('unblock user response', {
				success: true,
				message: 'User unblocked successfully',
			})
		} catch (error) {
			console.error('Error unblocking user:', error)
			socket.emit('unblock user response', {
				success: false,
				message: error.message || 'Failed to unblock user',
			})
		}
	})

	// Typing indicators
	socket.on(SOCKET_LISTENERS.USER.TYPING, async (data) => {
		try {
			const { conversationId, userId } = data
			if (conversationId && userId) {
				const socketEmitter = require('../../../chat/socketEmitter')
				socketEmitter.emitTyping(conversationId, userId)
			}
		} catch (error) {
			console.error('Error in typing handler:', error)
		}
	})

	socket.on(SOCKET_LISTENERS.USER.STOP_TYPING, async (data) => {
		try {
			const { conversationId, userId } = data
			if (conversationId && userId) {
				const socketEmitter = require('../../../chat/socketEmitter')
				socketEmitter.emitStopTyping(conversationId, userId)
			}
		} catch (error) {
			console.error('Error in stop typing handler:', error)
		}
	})
}

module.exports = {
	registerReportingHandlers,
}
