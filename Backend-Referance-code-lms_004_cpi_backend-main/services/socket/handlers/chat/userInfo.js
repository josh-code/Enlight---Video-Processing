const { User } = require('../../../../models/app/user_model')
const blockingService = require('../../../chat/blockingService')
const { SOCKET_EVENTS, SOCKET_LISTENERS } = require('../../events')

/**
 * User Info Handlers
 * Handle user info requests, online status
 */

/**
 * Register user info handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {SocketIO.Socket} socket - Socket instance
 * @param {Object} onlineUsers - Online users map
 */
function registerUserInfoHandlers(io, socket, onlineUsers) {
	// Get user info
	socket.on(
		SOCKET_LISTENERS.USER.GET_INFO,
		async ({ receiverId, senderId }) => {
			try {
				if (!receiverId || !senderId) {
					return socket.emit(SOCKET_EVENTS.USER.INFO(''), {
						error: 'Missing required fields',
					})
				}

				const user = await User.findById(receiverId)

				if (!user || user.isDeleted || !user.isEnabled) {
					return socket.emit(SOCKET_EVENTS.USER.INFO(receiverId), {
						_id: receiverId,
						isDeleted: true,
					})
				}

				// Sanitize user info based on blocking
				const sanitizedUser = await blockingService.sanitizeUserInfo(
					user,
					senderId
				)

				socket.emit(SOCKET_EVENTS.USER.INFO(receiverId), sanitizedUser)
			} catch (error) {
				console.error('Error in get user info handler:', error)
				socket.emit(SOCKET_EVENTS.USER.INFO(''), {
					error: 'Unable to fetch user info',
				})
			}
		}
	)
}

module.exports = {
	registerUserInfoHandlers,
}
