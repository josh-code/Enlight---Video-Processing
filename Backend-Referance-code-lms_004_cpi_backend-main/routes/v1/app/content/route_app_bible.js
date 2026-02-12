const express = require('express')
const router = express.Router()
const HTTP = require('../../../../constants/httpStatus')
const { bibleApiService } = require('../../../../services/readingPlan')
const auth = require('../../../../middleware/auth')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')

/**
 * GET /api/app/content/bible/versions
 * Get all available Bible versions
 */
router.get(
	'/versions',
	catchAsyncError(async (req, res) => {
		const { page, limit, language_code } = req.query
		const options = {
			page: page ? parseInt(page) : 1,
			limit: limit ? parseInt(limit) : 25,
			language_code: language_code ? language_code : 'eng',
		}

		const result = await bibleApiService.getBibleVersions(options)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { items: result.data, pagination: result.pagination },
			message: 'Bible versions retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/books/:bibleId
 * Get books for a specific Bible version
 */
router.get(
	'/books/:bibleId',
	[auth],
	catchAsyncError(async (req, res) => {
		const { bibleId } = req.params
		const { page, limit } = req.query

		if (!bibleId) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Bible ID is required',
			})
		}

		const options = {
			page: page ? parseInt(page) : 1,
			limit: limit ? parseInt(limit) : 25,
		}

		const result = await bibleApiService.getBooks(bibleId, options)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { items: result.data, pagination: result.pagination },
			message: 'Books retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/chapter/:bibleId/:bookId/:chapter
 * Get chapter content for a specific Bible version
 */
router.get(
	'/chapter/:bibleId/:bookId/:chapter',
	[auth],
	catchAsyncError(async (req, res) => {
		const { bibleId, bookId, chapter } = req.params

		if (!bibleId || !bookId || !chapter) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Bible ID, Book ID, and Chapter are required',
			})
		}

		const chapterNum = parseInt(chapter)
		if (isNaN(chapterNum) || chapterNum < 1) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Invalid chapter number',
			})
		}

		const chapterData = await bibleApiService.getChapter(
			bibleId,
			bookId,
			chapterNum
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: chapterData,
			message: 'Chapter content retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/audio/:bibleId/:bookId/:chapter
 * Get audio URL for a specific chapter
 * Query params:
 *   - include_timestamps: (optional) Set to 'true' to include verse timestamps in the response
 */
router.get(
	'/audio/:bibleId/:bookId/:chapter',
	[auth],
	catchAsyncError(async (req, res) => {
		const { bibleId, bookId, chapter } = req.params
		const { include_timestamps } = req.query

		if (!bibleId || !bookId || !chapter) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Bible ID, Book ID, and Chapter are required',
			})
		}

		const chapterNum = parseInt(chapter)
		if (isNaN(chapterNum) || chapterNum < 1) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Invalid chapter number',
			})
		}

		const shouldIncludeTimestamps =
			include_timestamps === 'true' || include_timestamps === true

		const audioData = await bibleApiService.getChapterAudio(
			bibleId,
			bookId,
			chapterNum,
			shouldIncludeTimestamps
		)
		if (!audioData) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'Audio not available for this chapter',
			})
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: audioData,
			message: 'Audio URL retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/timestamps/:filesetId/:bookId/:chapter
 * Get verse timestamps for audio
 */
router.get(
	'/timestamps/:filesetId/:bookId/:chapter',
	[auth],
	catchAsyncError(async (req, res) => {
		const { filesetId, bookId, chapter } = req.params

		if (!filesetId || !bookId || !chapter) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Fileset ID, Book ID, and Chapter are required',
			})
		}

		const chapterNum = parseInt(chapter)
		if (isNaN(chapterNum) || chapterNum < 1) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Invalid chapter number',
			})
		}

		// Check if timestamps are available for this fileset first
		const availableFilesets =
			await bibleApiService.getAvailableTimestampFilesets()
		if (!availableFilesets.includes(filesetId)) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'Timestamps not available for this fileset',
			})
		}

		const timestamps = await bibleApiService.getVerseTimestamps(
			filesetId,
			bookId,
			chapterNum
		)

		if (!timestamps) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.NOT_FOUND,
				data: null,
				message: 'Timestamps not available for this chapter',
			})
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: timestamps,
			message: 'Verse timestamps retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/search/:filesetId
 * Search Bible text
 */
router.get(
	'/search/:filesetId',
	[auth],
	catchAsyncError(async (req, res) => {
		const { filesetId } = req.params
		const { q, limit, page, books } = req.query

		if (!filesetId || !q) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Fileset ID and search query are required',
			})
		}

		const searchOptions = {
			limit: limit ? parseInt(limit) : 20,
			page: page ? parseInt(page) : 1,
			books: books || '',
		}

		const searchResults = await bibleApiService.searchBible(
			filesetId,
			q,
			searchOptions
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: searchResults,
			message: 'Search completed successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/copyright/:bibleId
 * Get copyright information for a Bible version
 */
router.get(
	'/copyright/:bibleId',
	[auth],
	catchAsyncError(async (req, res) => {
		const { bibleId } = req.params

		if (!bibleId) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Bible ID is required',
			})
		}

		const copyright = await bibleApiService.getCopyright(bibleId)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: copyright,
			message: 'Copyright information retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/versions/all
 * Get all available Bible versions (non-paginated)
 */
router.get(
	'/versions/all',
	catchAsyncError(async (req, res) => {
		const { language_code } = req.query
		const allVersions = await bibleApiService.getAllBibleVersions(
			language_code || 'eng'
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: allVersions,
			message: 'All Bible versions retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/books/:bibleId/all
 * Get all books for a Bible version (non-paginated)
 */
router.get(
	'/books/:bibleId/all',
	[auth],
	catchAsyncError(async (req, res) => {
		const { bibleId } = req.params

		if (!bibleId) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Bible ID is required',
			})
		}

		const allBooks = await bibleApiService.getAllBooks(bibleId)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: allBooks,
			message: 'All books retrieved successfully',
		})
	})
)

/**
 * GET /api/app/content/bible/audio-formats/:bibleId
 * Get all available audio formats for a Bible version
 */
router.get(
	'/audio-formats/:bibleId',
	[auth],
	catchAsyncError(async (req, res) => {
		const { bibleId } = req.params

		if (!bibleId) {
			return sendResponse({
				res,
				status: false,
				code: HTTP.BAD_REQUEST,
				data: null,
				message: 'Bible ID is required',
			})
		}

		const audioFormats = await bibleApiService.getAvailableAudioFormats(bibleId)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: audioFormats,
			message: 'Available audio formats retrieved successfully',
		})
	})
)

module.exports = router
