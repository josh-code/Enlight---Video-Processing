const mongoose = require('mongoose')
const { Course } = require('../../models/common/content/course_model')
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
 * @returns {Object} Localized document
 */
function localizeCourseFromAggregation(doc, language) {
	const localized = {
		_id: doc._id,
		name: doc.name?.[language] || doc.name?.en || '',
		description: doc.description?.[language] || doc.description?.en || '',
		introVideo: doc.introVideo?.[language] || doc.introVideo?.en || null,
		introVideoTranscribe:
			doc.introVideoTranscribe?.[language] ||
			doc.introVideoTranscribe?.en ||
			null,
		order: doc.order,
		image: doc.image,
		slug: doc.slug,
		presentedBy: doc.presentedBy,
		instructorImage: doc.instructorImage,
		isModular: doc.isModular,
		isDraft: doc.isDraft,
		availableLanguages: doc.availableLanguages,
		sessionCount: doc.sessionCount || 0,
		totalDuration: doc.totalDuration || 0,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	}

	return localized
}

/**
 * Course Service
 * Handles business logic for course operations
 */
class CourseService {
	constructor() {
		// Initialize dependencies if needed
	}

	/**
	 * Get paginated list of published courses
	 * @param {Object} query - Query parameters (page, limit, search, sort)
	 * @param {string} language - Language code for localization
	 * @returns {Promise<Object>} Paginated courses data
	 */
	async getPublishedCourses(query, language = DEFAULT_LANGUAGE) {
		const { page, limit, skip } = getPaginationParams(query, {
			page: 1,
			limit: 20,
			maxLimit: 100,
		})

		const searchQuery = query.search ? query.search.trim() : ''
		const sortOption = query.sort || 'order'

		// Build match stage for search
		const matchStage = {
			isDraft: false,
		}

		// Add search filter if provided
		if (searchQuery) {
			matchStage.$or = [
				{ [`name.${language}`]: { $regex: searchQuery, $options: 'i' } },
				{ [`name.en`]: { $regex: searchQuery, $options: 'i' } },
				{ [`description.${language}`]: { $regex: searchQuery, $options: 'i' } },
				{ [`description.en`]: { $regex: searchQuery, $options: 'i' } },
			]
		}

		// Build sort stage based on sort option
		// Note: duration and session count sorting will be done after calculation
		let sortStage = { order: 1 } // Default sort
		let needsPostSort = false // Flag for sorting after duration calculation

		switch (sortOption) {
			case 'name-asc':
				sortStage = { [`name.${language}`]: 1, [`name.en`]: 1 }
				break
			case 'name-desc':
				sortStage = { [`name.${language}`]: -1, [`name.en`]: -1 }
				break
			case 'duration-asc':
			case 'duration-desc':
			case 'sessions-asc':
			case 'sessions-desc':
				// These will be sorted after calculation
				needsPostSort = true
				sortStage = { order: 1 } // Temporary sort
				break
			case 'date-desc':
				sortStage = { createdAt: -1 }
				break
			case 'date-asc':
				sortStage = { createdAt: 1 }
				break
			case 'order':
			default:
				sortStage = { order: 1 }
				break
		}

		// Aggregation pipeline to get published courses with metadata
		const pipeline = [
			// Match only published courses (and search if provided)
			{
				$match: matchStage,
			},
			// Lookup sessions to calculate metadata
			{
				$lookup: {
					from: 'sessions',
					localField: 'sessions',
					foreignField: '_id',
					as: 'sessionDetails',
				},
			},
			// Calculate session count
			{
				$addFields: {
					sessionCount: { $size: '$sessionDetails' },
				},
			},
			// Sort based on sort option
			{
				$sort: sortStage,
			},
			// Pagination
			{
				$skip: skip,
			},
			{
				$limit: limit,
			},
			// Project fields including sessionDetails for duration calculation
			{
				$project: {
					_id: 1,
					name: 1,
					description: 1,
					image: 1,
					slug: 1,
					order: 1,
					presentedBy: 1,
					instructorImage: 1,
					isModular: 1,
					introVideo: 1,
					introVideoTranscribe: 1,
					availableLanguages: 1,
					sessionCount: 1,
					sessionDetails: {
						duration: 1,
					},
					createdAt: 1,
					updatedAt: 1,
				},
			},
		]

		// Get total count for pagination (with same match criteria)
		const totalResult = await Course.aggregate([
			{
				$match: matchStage,
			},
			{
				$count: 'total',
			},
		])

		const total = totalResult[0]?.total || 0

		// Execute aggregation
		let courses = await Course.aggregate(pipeline)

		// Calculate total duration and localize courses to requested language
		let localizedCourses = courses.map((course) => {
			// Calculate total duration from session details
			let totalDuration = 0
			if (course.sessionDetails && Array.isArray(course.sessionDetails)) {
				totalDuration = course.sessionDetails.reduce((sum, session) => {
					// Handle Map type duration - in aggregation results, Maps become objects
					if (session.duration && typeof session.duration === 'object') {
						const duration =
							session.duration[language] || session.duration.en || 0
						return sum + (typeof duration === 'number' ? duration : 0)
					}
					return sum
				}, 0)
			}

			// Add totalDuration to course object
			course.totalDuration = totalDuration

			// Remove sessionDetails as it's not needed in the response
			delete course.sessionDetails

			// Localize the course
			return localizeCourseFromAggregation(course, language)
		})

		// Post-sort for duration and session count (after calculation)
		if (needsPostSort) {
			localizedCourses.sort((a, b) => {
				switch (sortOption) {
					case 'duration-asc':
						return a.totalDuration - b.totalDuration
					case 'duration-desc':
						return b.totalDuration - a.totalDuration
					case 'sessions-asc':
						return a.sessionCount - b.sessionCount
					case 'sessions-desc':
						return b.sessionCount - a.sessionCount
					default:
						return 0
				}
			})
		}

		return buildPaginatedResponse(
			localizedCourses,
			page,
			limit,
			total,
			'courses'
		)
	}

	/**
	 * Get course by ID
	 * @param {string} courseId - MongoDB ObjectId
	 * @param {string} language - Language code for localization
	 * @returns {Promise<Object>} Course data
	 * @throws {ErrorHandler} When course not found or invalid ID
	 */
	async getCourseById(courseId, language = DEFAULT_LANGUAGE) {
		// Validate ObjectId format
		if (!mongoose.Types.ObjectId.isValid(courseId)) {
			throw new ErrorHandler('Invalid course ID format', HTTP.BAD_REQUEST)
		}

		const objectId = new mongoose.Types.ObjectId(courseId)

		// Aggregation pipeline to get course by ID
		const pipeline = [
			{
				$match: {
					_id: objectId,
					isDraft: false,
				},
			},
			// Lookup modules if course is modular
			{
				$lookup: {
					from: 'modules',
					localField: 'modules',
					foreignField: '_id',
					as: 'moduleDetails',
				},
			},
			// Lookup sessions
			{
				$lookup: {
					from: 'sessions',
					localField: 'sessions',
					foreignField: '_id',
					as: 'sessionDetails',
				},
			},
			// Sort sessions by order
			{
				$addFields: {
					sessionDetails: {
						$sortArray: {
							input: '$sessionDetails',
							sortBy: { order: 1 },
						},
					},
				},
			},
		]

		const result = await Course.aggregate(pipeline)

		if (!result || result.length === 0) {
			throw new ErrorHandler('Course not found', HTTP.NOT_FOUND)
		}

		const course = result[0]

		// Calculate sessionCount and totalDuration
		let sessionCount = 0
		let totalDuration = 0

		if (course.sessionDetails && Array.isArray(course.sessionDetails)) {
			sessionCount = course.sessionDetails.length

			// Calculate total duration from session details
			totalDuration = course.sessionDetails.reduce((sum, session) => {
				// Handle Map type duration - in aggregation results, Maps become objects
				if (session.duration && typeof session.duration === 'object') {
					const duration =
						session.duration[language] || session.duration.en || 0
					return sum + (typeof duration === 'number' ? duration : 0)
				}
				return sum
			}, 0)
		}

		// Get localized course data
		const localizedCourse = localizeCourseFromAggregation(course, language)

		// Add sessionCount and totalDuration to localized course
		localizedCourse.sessionCount = sessionCount
		localizedCourse.totalDuration = totalDuration

		// Localize modules if present
		if (course.moduleDetails && course.moduleDetails.length > 0) {
			localizedCourse.modules = course.moduleDetails.map((module) => {
				return {
					_id: module._id,
					name: module.name?.[language] || module.name?.en || '',
					description:
						module.description?.[language] || module.description?.en || '',
					order: module.order,
					course: module.course,
				}
			})
		}

		// Localize sessions if present (excluding HLS URLs for public access)
		if (course.sessionDetails && course.sessionDetails.length > 0) {
			localizedCourse.sessions = course.sessionDetails.map((session) => {
				return {
					_id: session._id,
					name: session.name?.[language] || session.name?.en || '',
					description:
						session.description?.[language] || session.description?.en || '',
					duration: session.duration?.[language] || session.duration?.en || 0,
					order: session.order,
					image: session.image,
					moduleId: session.moduleId,
					courseId: session.courseId,
					availableLanguages: session.availableLanguages,
				}
			})
		}

		return localizedCourse
	}

	/**
	 * Get course by slug
	 * @param {string} slug - Course slug
	 * @param {string} language - Language code for localization
	 * @returns {Promise<Object>} Course data
	 * @throws {ErrorHandler} When course not found
	 */
	async getCourseBySlug(slug, language = DEFAULT_LANGUAGE) {
		if (!slug || typeof slug !== 'string') {
			throw new ErrorHandler('Slug is required', HTTP.BAD_REQUEST)
		}

		// Aggregation pipeline to get course by slug
		const pipeline = [
			{
				$match: {
					slug: slug,
					isDraft: false,
				},
			},
			// Lookup modules if course is modular
			{
				$lookup: {
					from: 'modules',
					localField: 'modules',
					foreignField: '_id',
					as: 'moduleDetails',
				},
			},
			// Lookup sessions
			{
				$lookup: {
					from: 'sessions',
					localField: 'sessions',
					foreignField: '_id',
					as: 'sessionDetails',
				},
			},
			// Sort sessions by order
			{
				$addFields: {
					sessionDetails: {
						$sortArray: {
							input: '$sessionDetails',
							sortBy: { order: 1 },
						},
					},
				},
			},
		]

		const result = await Course.aggregate(pipeline)

		if (!result || result.length === 0) {
			throw new ErrorHandler('Course not found', HTTP.NOT_FOUND)
		}

		const course = result[0]

		// Calculate sessionCount and totalDuration
		let sessionCount = 0
		let totalDuration = 0

		if (course.sessionDetails && Array.isArray(course.sessionDetails)) {
			sessionCount = course.sessionDetails.length

			// Calculate total duration from session details
			totalDuration = course.sessionDetails.reduce((sum, session) => {
				// Handle Map type duration - in aggregation results, Maps become objects
				if (session.duration && typeof session.duration === 'object') {
					const duration =
						session.duration[language] || session.duration.en || 0
					return sum + (typeof duration === 'number' ? duration : 0)
				}
				return sum
			}, 0)
		}

		// Get localized course data
		const localizedCourse = localizeCourseFromAggregation(course, language)

		// Add sessionCount and totalDuration to localized course
		localizedCourse.sessionCount = sessionCount
		localizedCourse.totalDuration = totalDuration

		// Localize modules if present
		if (course.moduleDetails && course.moduleDetails.length > 0) {
			localizedCourse.modules = course.moduleDetails.map((module) => {
				return {
					_id: module._id,
					name: module.name?.[language] || module.name?.en || '',
					description:
						module.description?.[language] || module.description?.en || '',
					order: module.order,
					course: module.course,
				}
			})
		}

		// Localize sessions if present (excluding HLS URLs for public access)
		if (course.sessionDetails && course.sessionDetails.length > 0) {
			localizedCourse.sessions = course.sessionDetails.map((session) => {
				return {
					_id: session._id,
					name: session.name?.[language] || session.name?.en || '',
					description:
						session.description?.[language] || session.description?.en || '',
					duration: session.duration?.[language] || session.duration?.en || 0,
					order: session.order,
					image: session.image,
					moduleId: session.moduleId,
					courseId: session.courseId,
					availableLanguages: session.availableLanguages,
					// Note: HLS URLs, video URLs, and quiz data are excluded for public routes
					// These should be accessed via protected routes
				}
			})
		}

		return localizedCourse
	}
}

// Export singleton instance
module.exports = new CourseService()
