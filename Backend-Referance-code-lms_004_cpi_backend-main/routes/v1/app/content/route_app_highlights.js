const express = require('express')
const router = express.Router()
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const HTTP = require('../../../../constants/httpStatus')
const highlightService = require('../../../../services/hightlight')
const auth = require('../../../../middleware/auth')
const { HIGHLIGHT_COLORS } = require('../../../../constants/bible')

// Get available highlight colors
router.get(
	'/colors',
	catchAsyncError(async (req, res) => {
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: HIGHLIGHT_COLORS,
			message: 'Highlight colors retrieved successfully',
		})
	})
)

// Save a highlight
router.post(
	'/',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const highlightData = {
			...req.body,
			userId,
		}

		const highlight = await highlightService.saveHighlight(highlightData)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: highlight,
			message: 'Highlight saved successfully',
		})
	})
)

// Get user's highlights for a specific chapter
router.get(
	'/chapter',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { book, chapter, bibleVersion } = req.query

		if (!book || !chapter || !bibleVersion) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Book, chapter, and bibleVersion are required',
			})
		}

		const highlights = await highlightService.getChapterHighlights(
			userId,
			book,
			chapter,
			bibleVersion
		)
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: highlights,
			message: 'Chapter highlights retrieved successfully',
		})
	})
)

// Get all user's highlights (for highlights management page)
router.get(
	'/',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const { book, chapter, bibleVersion, page = 1, limit = 10 } = req.query

		// Parse pagination parameters
		const pageNum = parseInt(page)
		const limitNum = parseInt(limit)

		// Validate pagination parameters
		if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Invalid pagination parameters',
			})
		}

		const result = await highlightService.getUserHighlights(
			userId,
			book,
			chapter,
			bibleVersion,
			pageNum,
			limitNum
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: result,
			message: 'Highlights retrieved successfully',
		})
	})
)

// Get a specific highlight
router.get(
	'/:id',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const highlightId = req.params.id

		const highlight = await highlightService.getHighlightById(
			userId,
			highlightId
		)
		if (!highlight) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'Highlight not found',
			})
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: highlight,
			message: 'Highlight retrieved successfully',
		})
	})
)

// Update a highlight
router.put(
	'/:id',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const highlightId = req.params.id
		const updates = req.body

		const highlight = await highlightService.updateHighlight(
			userId,
			highlightId,
			updates
		)
		if (!highlight) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'Highlight not found',
			})
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: highlight,
			message: 'Highlight updated successfully',
		})
	})
)

// Delete a highlight
router.delete(
	'/:id',
	[auth],
	catchAsyncError(async (req, res) => {
		const userId = req.user._id.toString()
		const highlightId = req.params.id

		const success = await highlightService.deleteHighlight(userId, highlightId)
		if (!success) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'Highlight not found',
			})
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Highlight deleted successfully',
		})
	})
)

module.exports = router
