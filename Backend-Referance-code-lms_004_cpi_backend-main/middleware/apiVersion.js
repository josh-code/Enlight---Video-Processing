/**
 * API Version Middleware
 *
 * This middleware:
 * 1. Sets the API version on the request object for use in handlers
 * 2. Adds X-API-Version header to responses for client transparency
 * 3. Optionally logs deprecation warnings for unversioned endpoints
 *
 * Usage:
 *   // For versioned routes
 *   app.use("/api/v1", apiVersionMiddleware("v1"), v1Routes);
 *
 *   // For deprecated unversioned routes
 *   app.use("/api/app", deprecationMiddleware("v1", "2025-12-31"), v1Routes.app);
 */

/**
 * Creates middleware that sets the API version for a route
 * @param {string} version - The API version (e.g., "v1", "v2")
 * @returns {Function} Express middleware function
 */
function apiVersionMiddleware(version) {
	return (req, res, next) => {
		req.apiVersion = version
		res.setHeader('X-API-Version', version)
		next()
	}
}

/**
 * Creates middleware that adds deprecation headers and logging for unversioned endpoints
 * @param {string} version - The version being used (e.g., "v1")
 * @param {string} sunsetDate - ISO date string when the unversioned endpoint will be removed (optional)
 * @returns {Function} Express middleware function
 */
function deprecationMiddleware(version, sunsetDate = null) {
	return (req, res, next) => {
		req.apiVersion = version
		res.setHeader('X-API-Version', version)
		res.setHeader('Deprecation', 'true')
		res.setHeader(
			'X-Deprecation-Notice',
			'Please use versioned API endpoints (e.g., /api/v1/...)'
		)

		if (sunsetDate) {
			res.setHeader('Sunset', sunsetDate)
		}

		// Log deprecation warning (can be sent to monitoring systems)
		console.warn(
			`[DEPRECATED API] Unversioned endpoint accessed: ${req.method} ${req.originalUrl}`
		)

		next()
	}
}

/**
 * Utility to check if request is using a specific API version
 * @param {Request} req - Express request object
 * @param {string} version - Version to check (e.g., "v1")
 * @returns {boolean}
 */
function isApiVersion(req, version) {
	return req.apiVersion === version
}

/**
 * Utility to get the current API version from request
 * @param {Request} req - Express request object
 * @returns {string|undefined}
 */
function getApiVersion(req) {
	return req.apiVersion
}

module.exports = {
	apiVersionMiddleware,
	deprecationMiddleware,
	isApiVersion,
	getApiVersion,
}
