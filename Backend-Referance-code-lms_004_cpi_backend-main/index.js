const express = require('express')
const { Server } = require('socket.io')
const http = require('http')
const cors = require('cors')
const app = express()
require('dotenv').config()
const config = require('config')

const cronJobs = require('./cron')
const { initSocket } = require('./startup/socket')

const FRONTEND_DOMAINS = config.get('FRONTEND_DOMAINS')
const allowedOrigins = FRONTEND_DOMAINS
	? FRONTEND_DOMAINS.split(',').map((item) => item.trim())
	: []

// Apply CORS middleware to Express app
app.use(cors())

// Initialize the HTTP server
const server = http.createServer(app)

// Initialize the Socket.io server with CORS options
const io = new Server(server, {
	cors: {
		origin: function (origin, callback) {
			if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
				// console.log("Socket.io CORS allowed for:", origin);
				callback(null, true)
			} else {
				console.log('Socket.io CORS denied for:', origin)
				callback(new Error('Not allowed by CORS'))
			}
		},
		methods: ['GET', 'POST'],
		credentials: true,
	},
})

require('./startup/routes')(app)
require('./startup/database')()

// Executing Cron Jobs
cronJobs()

const port = process.env.PORT || 8000

// Executing socket io
initSocket(io)

server.listen(port, () => {
	console.log(`Listening on port ${port}`)
})

module.exports = app
