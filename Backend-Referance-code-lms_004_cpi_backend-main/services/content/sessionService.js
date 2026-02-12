const mongoose = require('mongoose')
const { Session } = require('../../models/common/content/session_model')
const ErrorHandler = require('../../utils/errorHandler')
const HTTP = require('../../constants/httpStatus')
const {
	getPaginationParams,
	buildPaginatedResponse,
} = require('../../utils/pagination')
const { DEFAULT_LANGUAGE } = require('../../constants/supportedLanguage')

/**
 * Helper function to localize Map fields from aggregation results
 * @param {Object} doc - Document from aggregation
 * @param {string} language - Language code
 * @param {boolean} includeProtectedFields - Whether to include HLS URLs and video URLs (default: false)
 * @returns {Object} Localized document
 */
function localizeSessionFromAggregation(
	doc,
	language,
	includeProtectedFields = false
) {
	const localized = {
		_id: doc._id,
		name: doc.name?.[language] || doc.name?.en || '',
		description: doc.description?.[language] || doc.description?.en || '',
		duration: doc.duration?.[language] || doc.duration?.en || 0,
		transcribe: doc.transcribe?.[language] || doc.transcribe?.en || null,
		order: doc.order,
		image: doc.image,
		moduleId: doc.moduleId,
		courseId: doc.courseId,
		availableLanguages: doc.availableLanguages || [],
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	}

	// Include protected fields only if explicitly requested (for authenticated routes)
	if (includeProtectedFields) {
		localized.video = doc.video?.[language] || doc.video?.en || null
		localized.attachment =
			doc.attachment?.[language] || doc.attachment?.en || null
		localized.hls = doc.hls?.[language] || doc.hls?.en || null
	}

	return localized
}

/**
 * Session Service
 * Handles business logic for session operations
 */
class SessionService {
	constructor() {
		// Initialize dependencies if needed
	}

	/**
	 * Get session by ID with localization
	 * @param {string} sessionId - Session MongoDB ObjectId
	 * @param {string} language - Language code for localization
	 * @param {boolean} includeProtectedFields - Whether to include HLS URLs and video URLs (default: false)
	 * @returns {Promise<Object>} Localized session data
	 * @throws {ErrorHandler} When session not found
	 */
	async getSessionById(
		sessionId,
		language = DEFAULT_LANGUAGE,
		includeProtectedFields = false
	) {
		if (!sessionId || typeof sessionId !== 'string') {
			throw new ErrorHandler('Session ID is required', HTTP.BAD_REQUEST)
		}

		// Validate ObjectId format
		if (!mongoose.Types.ObjectId.isValid(sessionId)) {
			throw new ErrorHandler('Invalid session ID format', HTTP.BAD_REQUEST)
		}

		const sessionObjectId = new mongoose.Types.ObjectId(sessionId)

		// Aggregation pipeline to get session by ID
		const pipeline = [
			{
				$match: {
					_id: sessionObjectId,
				},
			},
		]

		const result = await Session.aggregate(pipeline)

		if (!result || result.length === 0) {
			throw new ErrorHandler('Session not found', HTTP.NOT_FOUND)
		}

		const session = result[0]

		// Get localized session data
		return localizeSessionFromAggregation(
			session,
			language,
			includeProtectedFields
		)
	}

	/**
	 * Get paginated list of sessions for a course (non-modular courses)
	 * @param {string} courseId - Course MongoDB ObjectId
	 * @param {string} language - Language code for localization
	 * @param {Object} query - Query parameters (page, limit)
	 * @param {boolean} includeProtectedFields - Whether to include HLS URLs and video URLs (default: false)
	 * @returns {Promise<Object>} Paginated sessions data
	 * @throws {ErrorHandler} When course ID is invalid
	 */
	async getSessionsByCourseId(
		courseId,
		language = DEFAULT_LANGUAGE,
		query = {},
		includeProtectedFields = false
	) {
		if (!courseId || typeof courseId !== 'string') {
			throw new ErrorHandler('Course ID is required', HTTP.BAD_REQUEST)
		}

		// Validate ObjectId format
		if (!mongoose.Types.ObjectId.isValid(courseId)) {
			throw new ErrorHandler('Invalid course ID format', HTTP.BAD_REQUEST)
		}

		const { page, limit, skip } = getPaginationParams(query, {
			page: 1,
			limit: 50,
			maxLimit: 100,
		})

		const courseObjectId = new mongoose.Types.ObjectId(courseId)

		// Aggregation pipeline to get sessions by course ID
		const pipeline = [
			{
				$match: {
					courseId: courseObjectId,
					moduleId: { $exists: false }, // Only non-modular sessions
				},
			},
			{
				$sort: { order: 1 },
			},
			{
				$skip: skip,
			},
			{
				$limit: limit,
			},
		]

		// Count total sessions for pagination
		const countPipeline = [
			{
				$match: {
					courseId: courseObjectId,
					moduleId: { $exists: false },
				},
			},
			{
				$count: 'total',
			},
		]

		const [sessions, totalResult] = await Promise.all([
			Session.aggregate(pipeline),
			Session.aggregate(countPipeline),
		])

		const total = totalResult[0]?.total || 0

		// Localize sessions
		const localizedSessions = sessions.map((session) =>
			localizeSessionFromAggregation(session, language, includeProtectedFields)
		)

		return buildPaginatedResponse(
			localizedSessions,
			page,
			limit,
			total,
			'sessions'
		)
	}

	/**
	 * Get paginated list of sessions for a module (modular courses)
	 * @param {string} moduleId - Module MongoDB ObjectId
	 * @param {string} language - Language code for localization
	 * @param {Object} query - Query parameters (page, limit)
	 * @param {boolean} includeProtectedFields - Whether to include HLS URLs and video URLs (default: false)
	 * @returns {Promise<Object>} Paginated sessions data
	 * @throws {ErrorHandler} When module ID is invalid
	 */
	async getSessionsByModuleId(
		moduleId,
		language = DEFAULT_LANGUAGE,
		query = {},
		includeProtectedFields = false
	) {
		if (!moduleId || typeof moduleId !== 'string') {
			throw new ErrorHandler('Module ID is required', HTTP.BAD_REQUEST)
		}

		// Validate ObjectId format
		if (!mongoose.Types.ObjectId.isValid(moduleId)) {
			throw new ErrorHandler('Invalid module ID format', HTTP.BAD_REQUEST)
		}

		const { page, limit, skip } = getPaginationParams(query, {
			page: 1,
			limit: 50,
			maxLimit: 100,
		})

		const moduleObjectId = new mongoose.Types.ObjectId(moduleId)

		// Aggregation pipeline to get sessions by module ID
		const pipeline = [
			{
				$match: {
					moduleId: moduleObjectId,
				},
			},
			{
				$sort: { order: 1 },
			},
			{
				$skip: skip,
			},
			{
				$limit: limit,
			},
		]

		// Count total sessions for pagination
		const countPipeline = [
			{
				$match: {
					moduleId: moduleObjectId,
				},
			},
			{
				$count: 'total',
			},
		]

		const [sessions, totalResult] = await Promise.all([
			Session.aggregate(pipeline),
			Session.aggregate(countPipeline),
		])

		const total = totalResult[0]?.total || 0

		// Localize sessions
		const localizedSessions = sessions.map((session) =>
			localizeSessionFromAggregation(session, language, includeProtectedFields)
		)

		return buildPaginatedResponse(
			localizedSessions,
			page,
			limit,
			total,
			'sessions'
		)
	}
}

// Export singleton instance
module.exports = new SessionService()
