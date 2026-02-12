const express = require('express')
const router = express.Router()

const { courseService } = require('../../../../services/content')
const { extractLanguage } = require('../../../../middleware/languageFilter')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const HTTP = require('../../../../constants/httpStatus')

/**
 * GET /api/v1/app/content/courses
 * Get paginated list of published courses
 * Query params: page, limit, lang (optional)
 */
router.get(
	'/',
	[extractLanguage],
	catchAsyncError(async (req, res) => {
		const language = req.language
		const courses = await courseService.getPublishedCourses(req.query, language)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: courses,
			message: 'Courses retrieved successfully',
		})
	})
)

/**
 * GET /api/v1/app/content/courses/:id
 * Get course by ID
 * Params: id (MongoDB ObjectId)
 * Query params: lang (optional)
 */
router.get(
	'/:id',
	[extractLanguage],
	catchAsyncError(async (req, res) => {
		const { id } = req.params
		const language = req.language

		const course = await courseService.getCourseById(id, language)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: course,
			message: 'Course retrieved successfully',
		})
	})
)

/**
 * GET /api/v1/app/content/courses/slug/:slug
 * Get course by slug
 * Params: slug (course slug)
 * Query params: lang (optional)
 */
router.get(
	'/slug/:slug',
	[extractLanguage],
	catchAsyncError(async (req, res) => {
		const { slug } = req.params
		const language = req.language

		const course = await courseService.getCourseBySlug(slug, language)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: course,
			message: 'Course retrieved successfully',
		})
	})
)

module.exports = router
