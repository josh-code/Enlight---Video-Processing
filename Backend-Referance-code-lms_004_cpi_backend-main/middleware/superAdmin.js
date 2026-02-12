const jwt = require('jsonwebtoken')
const config = require('config')
const { User } = require('../models/app/user_model')

module.exports = async function (req, res, next) {
	try {
		const token = req.header('x-auth-token')
		if (!token) return res.status(401).send('Access denied. No token provided')

		const decoded = jwt.verify(token, config.get('jwtPrivateKey'))

		const user = await User.findById(decoded._id).lean()

		if (!user.isSuperAdmin) {
			return res.status(403).send('Access denied. Not a super admin.')
		}

		if (user._id) {
			user._id = user._id.toString()
		}
		req.user = user
		next()
	} catch (e) {
		return res.status(401).send('Invalid token.')
	}
}
