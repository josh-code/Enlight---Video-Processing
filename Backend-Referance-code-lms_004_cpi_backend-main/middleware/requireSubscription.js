const { Subscription } = require('../models/app/subscription_model')
const ErrorHandler = require('../utils/errorHandler')
const HTTP = require('../constants/httpStatus')

/**
 * Middleware to check if user has an active subscription
 * Attaches subscription to req.subscription if found
 */
module.exports = async function (req, res, next) {
	try {
		const subscription = await Subscription.findOne({
			userId: req.user._id,
			status: { $in: ['active', 'trialing'] },
		}).lean()

		if (!subscription) {
			return res.status(HTTP.FORBIDDEN).json({
				success: false,
				code: HTTP.FORBIDDEN,
				message: 'Active subscription required to access this content',
				data: null,
			})
		}

		// Attach subscription to request for use in route handlers
		req.subscription = subscription
		next()
	} catch (error) {
		console.error('Error checking subscription:', error)
		return res.status(HTTP.INTERNAL_SERVER_ERROR).json({
			success: false,
			code: HTTP.INTERNAL_SERVER_ERROR,
			message: 'Error checking subscription status',
			data: null,
		})
	}
}
