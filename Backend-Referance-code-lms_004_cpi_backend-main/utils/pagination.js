/**
 * Pagination Utility
 *
 * Provides consistent pagination helpers for API responses.
 *
 * Standard pagination response format:
 * {
 *   items: [...],
 *   pagination: {
 *     page: 1,
 *     limit: 20,
 *     total: 100,
 *     totalPages: 5,
 *     hasNextPage: true,
 *     hasPrevPage: false
 *   }
 * }
 */

/**
 * Extracts and validates pagination parameters from query string.
 *
 * @param {Object} query - Express request query object
 * @param {Object} defaults - Default values for pagination
 * @param {number} defaults.page - Default page number (default: 1)
 * @param {number} defaults.limit - Default items per page (default: 20)
 * @param {number} defaults.maxLimit - Maximum allowed limit (default: 100)
 * @returns {{ page: number, limit: number, skip: number }}
 *
 * @example
 * const { page, limit, skip } = getPaginationParams(req.query);
 * const items = await Model.find().skip(skip).limit(limit);
 */
function getPaginationParams(query, defaults = {}) {
	const {
		page: defaultPage = 1,
		limit: defaultLimit = 20,
		maxLimit = 100,
	} = defaults

	let page = parseInt(query.page, 10)
	let limit = parseInt(query.limit, 10)

	// Validate and set defaults
	page = isNaN(page) || page < 1 ? defaultPage : page
	limit = isNaN(limit) || limit < 1 ? defaultLimit : limit

	// Enforce maximum limit
	limit = Math.min(limit, maxLimit)

	// Calculate skip for MongoDB
	const skip = (page - 1) * limit

	return { page, limit, skip }
}

/**
 * Builds pagination metadata object for API response.
 *
 * @param {number} page - Current page number (1-indexed)
 * @param {number} limit - Number of items per page
 * @param {number} total - Total number of items in the collection
 * @returns {{ page: number, limit: number, total: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean }}
 *
 * @example
 * const total = await Model.countDocuments(filter);
 * const pagination = buildPaginationMeta(page, limit, total);
 *
 * sendResponse({
 *   res,
 *   status: true,
 *   code: HTTP.OK,
 *   data: { items, pagination },
 *   message: "Items fetched successfully"
 * });
 */
function buildPaginationMeta(page, limit, total) {
	const totalPages = Math.ceil(total / limit) || 0

	return {
		page,
		limit,
		total,
		totalPages,
		hasNextPage: page < totalPages,
		hasPrevPage: page > 1,
	}
}

/**
 * Helper to build paginated response data.
 * Combines items array with pagination metadata.
 *
 * @param {Array} items - Array of items for current page
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @param {string} [itemsKey='items'] - Key name for the items array in response
 * @returns {Object} - Object with items and pagination
 *
 * @example
 * const data = buildPaginatedResponse(courses, page, limit, total, 'courses');
 * // Returns: { courses: [...], pagination: { ... } }
 */
function buildPaginatedResponse(items, page, limit, total, itemsKey = 'items') {
	return {
		[itemsKey]: items,
		pagination: buildPaginationMeta(page, limit, total),
	}
}

module.exports = {
	getPaginationParams,
	buildPaginationMeta,
	buildPaginatedResponse,
}
