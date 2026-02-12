/**
 * HTTP Status Code Constants
 * Use these constants instead of magic numbers for better code readability.
 *
 * Example usage:
 *   const HTTP = require('../../constants/httpStatus');
 *   sendResponse({ res, code: HTTP.OK, ... });
 *   return next(new ErrorHandler('Not found', HTTP.NOT_FOUND));
 */

module.exports = {
	// Success (2xx)
	OK: 200,
	CREATED: 201,
	ACCEPTED: 202,
	NO_CONTENT: 204,

	// Redirection (3xx)
	MOVED_PERMANENTLY: 301,
	FOUND: 302,
	NOT_MODIFIED: 304,

	// Client Errors (4xx)
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	PAYMENT_REQUIRED: 402,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	METHOD_NOT_ALLOWED: 405,
	CONFLICT: 409,
	GONE: 410,
	UNPROCESSABLE_ENTITY: 422,
	TOO_MANY_REQUESTS: 429,

	// Server Errors (5xx)
	INTERNAL_SERVER_ERROR: 500,
	NOT_IMPLEMENTED: 501,
	BAD_GATEWAY: 502,
	SERVICE_UNAVAILABLE: 503,
	GATEWAY_TIMEOUT: 504,
}
