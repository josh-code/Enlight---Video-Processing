const conversationService = require('../../../chat/conversationService')
const { SOCKET_EVENTS, SOCKET_LISTENERS } = require('../../events')
const { emitToUser } = require('../../index')

/**
 * Conversation Handlers
 * Handle conversation creation, acceptance, blocking, unblocking
 */

/**
 * Register conversation handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {SocketIO.Socket} socket - Socket instance
 * @param {Object} onlineUsers - Online users map
 */
function registerConversationHandlers(io, socket, onlineUsers) {
	// Get conversation list
	socket.on(SOCKET_LISTENERS.CONVERSATION.GET_LIST, async (userId) => {
		try {
			if (!userId) {
				return socket.emit(SOCKET_EVENTS.CONVERSATION.LIST(''), {
					error: 'User ID is required',
				})
			}

			const conversations =
				await conversationService.getConversationsForUser(userId)
			emitToUser(userId, SOCKET_EVENTS.CONVERSATION.LIST(userId), conversations)
		} catch (error) {
			console.error('Error in get conversation list handler:', error)
			socket.emit(SOCKET_EVENTS.CONVERSATION.LIST(''), {
				error: 'Failed to get conversations',
			})
		}
	})

	// Accept conversation
	socket.on(SOCKET_LISTENERS.CONVERSATION.ACCEPT, async (data) => {
		try {
			const { conversationId, userId } = data

			if (!conversationId || !userId) {
				return socket.emit(SOCKET_EVENTS.CONVERSATION.UPDATED(''), {
					error: 'Missing required fields',
				})
			}

			await conversationService.acceptConversation(conversationId, userId)
			// Conversation service handles socket emission
		} catch (error) {
			console.error('Error in accept conversation handler:', error)
			socket.emit(SOCKET_EVENTS.CONVERSATION.UPDATED(''), {
				error: error.message || 'Failed to accept conversation',
			})
		}
	})

	// Block conversation
	socket.on(SOCKET_LISTENERS.CONVERSATION.BLOCK, async (data) => {
		try {
			const { conversationId, blockerId } = data

			if (!conversationId || !blockerId) {
				return socket.emit(SOCKET_EVENTS.CONVERSATION.BLOCKED(''), {
					error: 'Missing required fields',
				})
			}

			await conversationService.blockConversation(conversationId, blockerId)
			// Conversation service handles socket emission
		} catch (error) {
			console.error('Error in block conversation handler:', error)
			socket.emit(SOCKET_EVENTS.CONVERSATION.BLOCKED(''), {
				error: error.message || 'Failed to block conversation',
			})
		}
	})

	// Unblock conversation
	socket.on(SOCKET_LISTENERS.CONVERSATION.UNBLOCK, async (data) => {
		try {
			const { conversationId, unblockerId } = data

			if (!conversationId || !unblockerId) {
				return socket.emit(SOCKET_EVENTS.CONVERSATION.UNBLOCKED(''), {
					error: 'Missing required fields',
				})
			}

			await conversationService.unblockConversation(conversationId, unblockerId)
			// Conversation service handles socket emission
		} catch (error) {
			console.error('Error in unblock conversation handler:', error)
			socket.emit(SOCKET_EVENTS.CONVERSATION.UNBLOCKED(''), {
				error: error.message || 'Failed to unblock conversation',
			})
		}
	})

	// Delete conversation
	socket.on(SOCKET_LISTENERS.CONVERSATION.DELETE, async (data) => {
		try {
			const { conversationId, userId } = data

			if (!conversationId || !userId) {
				return socket.emit(SOCKET_EVENTS.CONVERSATION.DELETED(''), {
					error: 'Missing required fields',
				})
			}

			await conversationService.deleteConversationForUser(
				conversationId,
				userId
			)
			// Conversation service handles socket emission
		} catch (error) {
			console.error('Error in delete conversation handler:', error)
			socket.emit(SOCKET_EVENTS.CONVERSATION.DELETED(''), {
				error: error.message || 'Failed to delete conversation',
			})
		}
	})
}

module.exports = {
	registerConversationHandlers,
}
