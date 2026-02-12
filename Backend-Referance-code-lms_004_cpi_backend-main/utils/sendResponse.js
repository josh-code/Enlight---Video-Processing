/**
 * Sends a response with the specified status, code, data, and message.
 * Automatically includes API version from the request if available.
 *
 * @param {object} options - The response options.
 * @param {object} options.res - The response object.
 * @param {boolean} options.status - The status to send in the response whether true or false.
 * @param {number} options.code - The status code to send in the response.
 * @param {any} options.data - The data to send in the response.
 * @param {string} options.message - The message to send in the response.
 */
const sendResponse = ({ res, status, code, data, message }) => {
	// Get API version from request if available (set by apiVersionMiddleware)
	const apiVersion = res.req?.apiVersion || null

	res.status(code).json({
		success: status,
		code,
		message,
		data,
		...(apiVersion && { apiVersion }),
	})
}

module.exports = sendResponse
