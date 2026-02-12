const express = require('express')
const router = express.Router()

const { sessionService } = require('../../../../services/content')
const { extractLanguage } = require('../../../../middleware/languageFilter')
const auth = require('../../../../middleware/auth')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const HTTP = require('../../../../constants/httpStatus')

/**
 * GET /api/v1/app/content/sessions/:sessionId
 * Get session by ID
 * Params: sessionId (MongoDB ObjectId)
 * Query params: lang (optional)
 * Requires authentication - includes protected fields (HLS URLs, video URLs)
 */
router.get(
	'/:sessionId',
	[auth, extractLanguage],
	catchAsyncError(async (req, res) => {
		const { sessionId } = req.params
		const language = req.language

		const session = await sessionService.getSessionById(
			sessionId,
			language,
			true
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: session,
			message: 'Session retrieved successfully',
		})
	})
)

/**
 * GET /api/v1/app/content/sessions/course/:courseId
 * Get paginated list of sessions for a course (non-modular courses)
 * Params: courseId (MongoDB ObjectId)
 * Query params: page, limit, lang (optional)
 * Public route - excludes protected fields (HLS URLs, video URLs)
 */
router.get(
	'/course/:courseId',
	[extractLanguage],
	catchAsyncError(async (req, res) => {
		const { courseId } = req.params
		const language = req.language

		const sessions = await sessionService.getSessionsByCourseId(
			courseId,
			language,
			req.query,
			false
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: sessions,
			message: 'Sessions retrieved successfully',
		})
	})
)

/**
 * GET /api/v1/app/content/sessions/module/:moduleId
 * Get paginated list of sessions for a module (modular courses)
 * Params: moduleId (MongoDB ObjectId)
 * Query params: page, limit, lang (optional)
 * Public route - excludes protected fields (HLS URLs, video URLs)
 */
router.get(
	'/module/:moduleId',
	[extractLanguage],
	catchAsyncError(async (req, res) => {
		const { moduleId } = req.params
		const language = req.language

		const sessions = await sessionService.getSessionsByModuleId(
			moduleId,
			language,
			req.query,
			false
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: sessions,
			message: 'Sessions retrieved successfully',
		})
	})
)

module.exports = router
