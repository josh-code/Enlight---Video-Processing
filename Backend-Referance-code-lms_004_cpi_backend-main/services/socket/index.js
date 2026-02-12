const { SOCKET_EVENTS, SOCKET_LISTENERS } = require('./events')

/**
 * Get Socket.IO instance
 * @returns {SocketIO.Server|null}
 */
function getSocketInstance() {
	try {
		// Lazy import to avoid circular dependencies with startup/socket -> handlers -> services
		const { getIO } = require('../../startup/socket')
		return getIO()
	} catch (error) {
		console.warn('⚠️ Socket.io instance not available:', error.message)
		return null
	}
}

/**
 * Get online users map
 * @returns {Object} Map of userId -> socketId
 */
function getOnlineUsers() {
	try {
		// Lazy import to avoid circular dependencies with startup/socket -> handlers -> services
		const {
			getOnlineUsers: getOnlineUsersFromStartup,
		} = require('../../startup/socket')
		return getOnlineUsersFromStartup()
	} catch (error) {
		console.warn('⚠️ Cannot get online users:', error.message)
		return {}
	}
}

/**
 * Emit event to a specific user
 * @param {string} userId - User ID
 * @param {string} eventName - Event name
 * @param {Object} data - Event data
 * @returns {boolean} Success status
 */
function emitToUser(userId, eventName, data) {
	const io = getSocketInstance()
	if (!io) {
		console.warn(
			`⚠️ Cannot emit ${eventName} to user ${userId}: Socket not available`
		)
		return false
	}

	// Find user's socket ID from onlineUsers
	const onlineUsers = getOnlineUsers()
	const socketId = onlineUsers[userId]

	if (socketId) {
		io.to(socketId).emit(eventName, data)
		console.log(`🔔 Emitted ${eventName} to user ${userId}`)
		return true
	} else {
		console.log(`⚠️ User ${userId} is offline, cannot emit ${eventName}`)
		return false
	}
}

/**
 * Emit event to all users in a room
 * @param {string} roomId - Room ID
 * @param {string} eventName - Event name
 * @param {Object} data - Event data
 * @returns {boolean} Success status
 */
function emitToRoom(roomId, eventName, data) {
	const io = getSocketInstance()
	if (!io) {
		console.warn(
			`⚠️ Cannot emit ${eventName} to room ${roomId}: Socket not available`
		)
		return false
	}

	io.to(roomId).emit(eventName, data)
	console.log(`🔔 Emitted ${eventName} to room ${roomId}`)
	return true
}

/**
 * Emit event to all connected clients
 * @param {string} eventName - Event name
 * @param {Object} data - Event data
 * @returns {boolean} Success status
 */
function emitToAll(eventName, data) {
	const io = getSocketInstance()
	if (!io) {
		console.warn(`⚠️ Cannot emit ${eventName}: Socket not available`)
		return false
	}

	io.emit(eventName, data)
	console.log(`🔔 Emitted ${eventName} to all clients`)
	return true
}

module.exports = {
	getSocketInstance,
	getOnlineUsers,
	emitToUser,
	emitToRoom,
	emitToAll,
	SOCKET_EVENTS,
	SOCKET_LISTENERS,
}
