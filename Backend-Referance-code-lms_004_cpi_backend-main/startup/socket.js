const chatHandlers = require('../services/socket/handlers/chat/index')
const { SOCKET_EVENTS } = require('../services/socket/events')

let onlineUsers = {}
let io = null

function initSocket(ioInstance) {
	io = ioInstance // Store the io instance globally
	io.on('connection', (socket) => {
		console.log(`User connected ${socket.id}`)

		// Register chat handlers
		chatHandlers.registerChatHandlers(io, socket, onlineUsers)

		socket.on('disconnect', () => {
			for (let userId in onlineUsers) {
				if (onlineUsers[userId] === socket.id) {
					delete onlineUsers[userId]
					break
				}
			}
			io.emit(SOCKET_EVENTS.USER.ONLINE_USERS, onlineUsers)
			console.log('User disconnected')
		})
	})
}

function getIO() {
	return io
}

function getOnlineUsers() {
	return onlineUsers
}

module.exports = { initSocket, getIO, getOnlineUsers }
