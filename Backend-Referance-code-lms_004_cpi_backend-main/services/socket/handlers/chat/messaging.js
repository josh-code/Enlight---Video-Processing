const messageService = require('../../../chat/messageService')
const { SOCKET_EVENTS, SOCKET_LISTENERS } = require('../../events')

/**
 * Messaging Handlers
 * Handle message sending, receiving, marking as read
 */

/**
 * Register messaging handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {SocketIO.Socket} socket - Socket instance
 * @param {Object} onlineUsers - Online users map
 */
function registerMessagingHandlers(io, socket, onlineUsers) {
	// Send message
	socket.on(SOCKET_LISTENERS.MESSAGE.SEND, async (data) => {
		try {
			const { conversationId, senderId, receiverId, content, type, media } =
				data

			if (!senderId || !receiverId || !content) {
				return socket.emit(SOCKET_EVENTS.MESSAGE.SENT(conversationId || ''), {
					error: 'Missing required fields',
				})
			}

			const message = await messageService.sendMessage(
				conversationId,
				senderId,
				receiverId,
				content,
				type || 'text',
				media
			)

			// Message service handles socket emission
		} catch (error) {
			console.error('Error in send message handler:', error)
			socket.emit(SOCKET_EVENTS.MESSAGE.SENT(conversationId || ''), {
				error: error.message || 'Failed to send message',
			})
		}
	})

	// Get message history
	socket.on(SOCKET_LISTENERS.MESSAGE.GET_HISTORY, async (data) => {
		try {
			const { conversationId, limit, skip, before } = data

			if (!conversationId) {
				return socket.emit('message:history:error', {
					error: 'Conversation ID is required',
				})
			}

			const messages = await messageService.getMessages(conversationId, {
				limit: limit || 50,
				skip: skip || 0,
				before,
			})

			socket.emit('message:history', {
				conversationId,
				messages,
			})
		} catch (error) {
			console.error('Error in get message history handler:', error)
			socket.emit('message:history:error', {
				error: 'Failed to get message history',
			})
		}
	})

	// Mark messages as read
	socket.on(SOCKET_LISTENERS.MESSAGE.MARK_READ, async (data) => {
		try {
			const { messageIds, userId } = data

			if (!messageIds || !Array.isArray(messageIds) || !userId) {
				return socket.emit(SOCKET_EVENTS.MESSAGE.READ(''), {
					error: 'Missing required fields',
				})
			}

			await messageService.markAsRead(messageIds, userId)
			// Message service handles socket emission
		} catch (error) {
			console.error('Error in mark read handler:', error)
			socket.emit(SOCKET_EVENTS.MESSAGE.READ(''), {
				error: 'Failed to mark messages as read',
			})
		}
	})

	// Delete message
	socket.on(SOCKET_LISTENERS.MESSAGE.DELETE, async (data) => {
		try {
			const { messageId, userId } = data

			if (!messageId || !userId) {
				return socket.emit(SOCKET_EVENTS.MESSAGE.DELETED(''), {
					error: 'Missing required fields',
				})
			}

			await messageService.deleteMessage(messageId, userId)
			// Message service handles socket emission
		} catch (error) {
			console.error('Error in delete message handler:', error)
			socket.emit(SOCKET_EVENTS.MESSAGE.DELETED(''), {
				error: error.message || 'Failed to delete message',
			})
		}
	})
}

module.exports = {
	registerMessagingHandlers,
}
