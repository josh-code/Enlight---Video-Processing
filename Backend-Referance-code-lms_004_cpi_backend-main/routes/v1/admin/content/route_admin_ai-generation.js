const express = require('express')
const router = express.Router()
const aiService = require('../../../../services/aiService')
const superAdmin = require('../../../../middleware/superAdmin')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

router.post(
	'/generate-session-content',
	superAdmin,
	catchAsyncError(async (req, res, next) => {
		const { transcription, language = 'en' } = req.body

		// Validate input
		if (!transcription || typeof transcription !== 'string') {
			return next(
				new ErrorHandler(
					'Transcription is required and must be a string',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate transcription length based on OpenAI's 4096 token limit
		// With 800 max output tokens, we need to limit input to stay within 4,096 total
		// Rough conversion: 1 token ≈ 4 characters
		// Safe limit: 12,000 characters (≈3,000 tokens) to leave room for prompt + output
		if (transcription.length > 12000) {
			return next(
				new ErrorHandler(
					'Transcription is too long. Maximum 12,000 characters allowed to ensure AI generation works properly.',
					HTTP.BAD_REQUEST
				)
			)
		}

		if (!['en', 'es'].includes(language)) {
			return next(
				new ErrorHandler(
					"Language must be either 'en' or 'es'",
					HTTP.BAD_REQUEST
				)
			)
		}

		// Generate content using AI
		const generatedContent = await aiService.generateSessionContent(
			transcription,
			language
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: generatedContent,
			message: 'Content generated successfully',
		})
	})
)

module.exports = router
