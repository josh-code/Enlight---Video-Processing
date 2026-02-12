const ErrorHandler = require('../utils/errorHandler')

/**
 * Error handler middleware
 * Handles all errors and sends a consistent JSON response.
 * Includes API version when available for consistency with success responses.
 *
 * @param {Error} err - The error object
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next middleware function
 */
module.exports = (err, req, res, next) => {
	console.log(err)

	// Set error status code
	err.statusCode = err.statusCode || 500
	err.message = err.message || 'Internal server error'

	// Set default status code to 500 if err.statusCode is undefined
	if (err.statusCode === undefined) {
		err.statusCode = 500
	}

	// Handle wrong mongodb id error
	if (err.name === 'CastError') {
		const message = `Resource is not found with this id. Invalid ${req.path}`
		err = new ErrorHandler(message, 400)
	}

	// Handle duplicate key error
	if (err.code === 11000) {
		const message = `Duplicate key ${Object.keys(err.keyValue)} entered`
		err = new ErrorHandler(message, 400)
	}

	// Handle wrong jwt error
	if (err.name === 'JsonWebTokenError') {
		const message = `Your URL is invalid. Please try again later`
		err = new ErrorHandler(message, 401)
	}

	// Handle expired jwt error
	if (err.name === 'TokenExpiredError') {
		const message = `Your URL is expired. Please try again later`
		err = new ErrorHandler(message, 401)
	}

	// Build error response object
	const errorObject =
		err instanceof ErrorHandler
			? err.toObject()
			: {
					success: false,
					code: err.statusCode,
					message: err.message,
					data: null,
				}

	// Get API version from request if available (set by apiVersionMiddleware)
	const apiVersion = req.apiVersion || null

	res.status(errorObject.code).json({
		success: false,
		code: errorObject.code,
		message: errorObject.message,
		data: errorObject.data,
		...(apiVersion && { apiVersion }),
	})
}
