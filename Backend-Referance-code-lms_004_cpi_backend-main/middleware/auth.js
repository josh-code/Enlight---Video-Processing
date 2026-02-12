const jwt = require('jsonwebtoken')
const config = require('config')
const { User } = require('../models/app/user_model')
const sendResponse = require('../utils/sendResponse')
const HTTP = require('../constants/httpStatus')

module.exports = async function (req, res, next) {
	const token = req.header('x-auth-token')
	if (!token) {
		return sendResponse({
			res,
			status: false,
			code: HTTP.UNAUTHORIZED,
			message: 'Access denied. No token provided.',
			data: null,
		})
	}

	try {
		const decoded = jwt.verify(token, config.get('jwtPrivateKey'))

		const user = await User.findById(decoded._id).select('+sessions').lean()
		if (!user) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.UNAUTHORIZED,
				message: 'Access denied. Invalid session.',
				data: null,
			})
		}

		if (user._id) {
			user._id = user._id.toString()
		}

		req.user = user
		next()
	} catch (error) {
		return sendResponse({
			res,
			status: false,
			code: HTTP.UNAUTHORIZED,
			message: 'Invalid token.',
			data: null,
		})
	}
}
