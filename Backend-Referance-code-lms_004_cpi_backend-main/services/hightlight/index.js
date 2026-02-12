const { Types } = require('mongoose')
const UserHighlight = require('../../models/app/reading/user_highlights_model')
const { BOOK_MAPPING } = require('../../constants/bible')

class HighlightService {
	getBookNameFromMapping(bookId) {
		// Find the book name from BOOK_MAPPING by book ID
		const bookEntry = Object.entries(BOOK_MAPPING).find(
			([name, id]) => id === bookId
		)
		return bookEntry ? bookEntry[0] : bookId // Return full name or fallback to ID
	}

	// Save a highlight
	async saveHighlight(highlightData) {
		try {
			const highlight = new UserHighlight(highlightData)
			await highlight.save()
			return highlight
		} catch (error) {
			console.error('Error saving highlight:', error)
			throw error
		}
	}

	// Get user's highlights with pagination (for highlights management page)
	async getUserHighlights(
		userId,
		book = null,
		chapter = null,
		bibleVersion = null,
		page = 1,
		limit = 10
	) {
		try {
			const query = { userId: new Types.ObjectId(userId) }

			if (book) query.book = book
			if (chapter) query.chapter = parseInt(chapter)
			if (bibleVersion) query.bibleVersion = bibleVersion

			// Calculate pagination
			const skip = (page - 1) * limit

			// Get total count for pagination info
			const totalCount = await UserHighlight.countDocuments(query)

			// Get paginated highlights
			const highlights = await UserHighlight.find(query)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean()

			// Calculate pagination metadata
			const totalPages = Math.ceil(totalCount / limit)
			const hasNextPage = page < totalPages
			const hasPrevPage = page > 1

			return {
				highlights: highlights.map((highlight) => ({
					...highlight,
					bookName: this.getBookNameFromMapping(highlight.book),
				})),
				pagination: {
					currentPage: page,
					totalPages,
					totalCount,
					limit,
					hasNextPage,
					hasPrevPage,
				},
			}
		} catch (error) {
			console.error('Error fetching highlights:', error)
			throw error
		}
	}

	// Get all highlights for a specific chapter (no pagination)
	async getChapterHighlights(userId, book, chapter, bibleVersion) {
		try {
			const query = {
				userId: new Types.ObjectId(userId),
				book: book,
				chapter: parseInt(chapter),
				bibleVersion: bibleVersion,
			}

			const highlights = await UserHighlight.find(query)
				.sort({ createdAt: -1 })
				.lean()

			return highlights.map((highlight) => ({
				...highlight,
				bookName: this.getBookNameFromMapping(highlight.book),
			}))
		} catch (error) {
			console.error('Error fetching chapter highlights:', error)
			throw error
		}
	}

	// Get a specific highlight by ID
	async getHighlightById(userId, highlightId) {
		try {
			const highlight = await UserHighlight.findOne({
				_id: new Types.ObjectId(highlightId),
				userId: new Types.ObjectId(userId),
			}).lean()

			return {
				...highlight,
				bookName: this.getBookNameFromMapping(highlight.book),
			}
		} catch (error) {
			console.error('Error fetching highlight:', error)
			throw error
		}
	}

	// Update a highlight
	async updateHighlight(userId, highlightId, updates) {
		try {
			const highlight = await UserHighlight.findOneAndUpdate(
				{
					_id: new Types.ObjectId(highlightId),
					userId: new Types.ObjectId(userId),
				},
				{ ...updates, updatedAt: new Date() },
				{ new: true }
			).lean()

			return {
				...highlight,
				bookName: this.getBookNameFromMapping(highlight.book),
			}
		} catch (error) {
			console.error('Error updating highlight:', error)
			throw error
		}
	}

	// Delete a highlight
	async deleteHighlight(userId, highlightId) {
		try {
			const result = await UserHighlight.findOneAndDelete({
				_id: new Types.ObjectId(highlightId),
				userId: new Types.ObjectId(userId),
			})

			return !!result
		} catch (error) {
			console.error('Error deleting highlight:', error)
			throw error
		}
	}

	// Get highlights by book and chapter range
	async getHighlightsByRange(userId, book, startChapter, endChapter) {
		try {
			const query = {
				userId: new Types.ObjectId(userId),
				book: book,
			}

			if (startChapter && endChapter) {
				query.chapter = {
					$gte: parseInt(startChapter),
					$lte: parseInt(endChapter),
				}
			} else if (startChapter) {
				query.chapter = { $gte: parseInt(startChapter) }
			} else if (endChapter) {
				query.chapter = { $lte: parseInt(endChapter) }
			}

			const highlights = await UserHighlight.find(query)
				.sort({ book: 1, chapter: 1, 'verses.verseNumber': 1 })
				.lean()

			return highlights.map((highlight) => ({
				...highlight,
				bookName: this.getBookNameFromMapping(highlight.book),
			}))
		} catch (error) {
			console.error('Error fetching highlights by range:', error)
			throw error
		}
	}

	// Get highlight statistics for a user
	async getHighlightStats(userId) {
		try {
			const stats = await UserHighlight.aggregate([
				{ $match: { userId: new Types.ObjectId(userId) } },
				{
					$group: {
						_id: null,
						totalHighlights: { $sum: 1 },
						totalVerses: { $sum: { $size: '$verses' } },
						booksHighlighted: { $addToSet: '$book' },
						chaptersHighlighted: {
							$addToSet: { book: '$book', chapter: '$chapter' },
						},
					},
				},
				{
					$project: {
						_id: 0,
						totalHighlights: 1,
						totalVerses: 1,
						uniqueBooks: { $size: '$booksHighlighted' },
						uniqueChapters: { $size: '$chaptersHighlighted' },
					},
				},
			])

			return (
				stats[0] || {
					totalHighlights: 0,
					totalVerses: 0,
					uniqueBooks: 0,
					uniqueChapters: 0,
				}
			)
		} catch (error) {
			console.error('Error fetching highlight stats:', error)
			throw error
		}
	}
}

module.exports = new HighlightService()
