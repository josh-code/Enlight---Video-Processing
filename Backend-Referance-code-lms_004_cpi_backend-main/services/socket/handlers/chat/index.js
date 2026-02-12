const messagingHandlers = require('./messaging')
const conversationHandlers = require('./conversations')
const userInfoHandlers = require('./userInfo')
const reportingHandlers = require('./reporting')

/**
 * Register all chat-related socket handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 * @param {SocketIO.Socket} socket - Socket instance
 * @param {Object} onlineUsers - Online users map (userId -> socketId)
 */
function registerChatHandlers(io, socket, onlineUsers) {
	// Register all handler modules
	messagingHandlers.registerMessagingHandlers(io, socket, onlineUsers)
	conversationHandlers.registerConversationHandlers(io, socket, onlineUsers)
	userInfoHandlers.registerUserInfoHandlers(io, socket, onlineUsers)
	reportingHandlers.registerReportingHandlers(io, socket, onlineUsers)
}

module.exports = {
	registerChatHandlers,
}
