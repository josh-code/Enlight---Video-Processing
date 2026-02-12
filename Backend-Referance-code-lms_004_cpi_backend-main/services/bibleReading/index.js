const axios = require('axios')
const config = require('config')
const BIBLE_CONSTANTS = require('../../constants/bible')

class BibleApiService {
	constructor() {
		this.baseUrl = config.get('BIBLE_BRAIN_BASE_URL')
		this.apiKey = config.get('BIBLE_BRAIN_API_KEY')
		this.headers = {
			'api-key': this.apiKey,
			'Content-Type': 'application/json',
		}
	}

	/**
	 * Check if a book is Old Testament
	 * @param {string} bookId - Book ID (e.g., 'GEN', '2CO')
	 * @returns {boolean} True if Old Testament, false if New Testament
	 */
	isOldTestamentBook(bookId) {
		return BIBLE_CONSTANTS.BIBLE_BOOKS.OLD_TESTAMENT.includes(bookId)
	}

	/**
	 * Get all available Bible versions
	 * @param {Object} options - Pagination options
	 * @returns {Promise<Object>} Object with data and pagination info
	 */
	async getBibleVersions(options = {}) {
		try {
			const params = {
				language_code: options.language_code || 'eng',
				page: options.page || 1,
				limit: options.limit || 25,
				v: 4,
				key: this.apiKey,
			}

			const response = await axios.get(`${this.baseUrl}/bibles`, { params })

			const bibles = response.data.data.map((bible) => ({
				id: bible.id,
				name: bible.name,
				abbreviation: bible.abbr,
				language: bible.language,
				languageId: bible.language_id,
				iso: bible.iso,
			}))

			function filterEnglishBibleVersions(allVersions) {
				// Map screenshot names to actual ENG abbreviations
				const targetMap = {
					ESV: 'ENGESV',
					KJV: 'ENGKJV',
					NASB: 'ENGNAS',
					NKJV: 'ENGNKJV',
					NLT: 'ENGNLT',
					// AMP, MSG, NET, NVI are not part of ENG dataset in your JSON
				}

				const targetAbbrs = Object.values(targetMap)

				return allVersions.filter(
					(v) =>
						v.abbreviation.startsWith('ENG') &&
						targetAbbrs.includes(v.abbreviation)
				)
			}

			if (options.language_code === 'eng') {
				const filteredBibles = filterEnglishBibleVersions(bibles)
				return {
					data: filteredBibles,
					pagination: response.data.meta?.pagination || null,
				}
			}

			return {
				data: bibles,
				pagination: response.data.meta?.pagination || null,
			}
		} catch (error) {
			console.error(
				'Error fetching Bible versions:',
				error.response?.data || error.message
			)
			throw new Error('Failed to fetch Bible versions')
		}
	}

	/**
	 * Get books for a specific Bible version
	 * @param {string} bibleId - Bible version ID
	 * @param {Object} options - Pagination options
	 * @returns {Promise<Object>} Object with data and pagination info
	 */
	async getBooks(bibleId, options = {}) {
		try {
			const params = {
				page: options.page || 1,
				limit: options.limit || 25,
				v: 4,
				key: this.apiKey,
			}

			const response = await axios.get(
				`${this.baseUrl}/bibles/${bibleId}/book`,
				{ params }
			)

			const books = response.data.data.map((book) => ({
				id: book.book_id,
				name: book.name,
				abbreviation: book.book_id,
				nameLong: book.name,
				chapters: book.chapters,
			}))

			return {
				data: books,
				pagination: response.data.meta?.pagination || null,
			}
		} catch (error) {
			console.error(
				'Error fetching books:',
				error.response?.data || error.message
			)
			throw new Error('Failed to fetch books')
		}
	}

	/**
	 * Get chapter content for a specific Bible version
	 * @param {string} bibleId - Bible version ID
	 * @param {string} bookId - Book ID
	 * @param {number} chapter - Chapter number
	 * @returns {Promise<Object>} Chapter content with verses
	 */
	async getChapter(bibleId, bookId, chapter) {
		try {
			// First get the fileset ID for text content
			const bibleResponse = await axios.get(
				`${this.baseUrl}/bibles/${bibleId}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			// Extract filesets from the nested structure - the response has data.data.filesets
			const filesets = bibleResponse.data.data?.filesets?.['dbp-prod'] || []
			// console.log(
			//     `Available filesets for ${bibleId}:`,
			//     filesets.map((fs) => ({ id: fs.id, type: fs.type, size: fs.size }))
			// );

			// Find text filesets (prefer text_json, then text_plain, then text_usx)
			const textFilesets = filesets.filter(
				(fs) =>
					fs.type === 'text_json' ||
					fs.type === 'text_plain' ||
					fs.type === 'text_usx'
			)

			if (textFilesets.length === 0) {
				// console.log(
				//     `No text filesets found for ${bibleId}. Available types:`,
				//     filesets.map((fs) => fs.type)
				// );
				throw new Error('No text filesets available for this Bible')
			}

			// Determine if this is Old Testament or New Testament book
			const isOldTestament = this.isOldTestamentBook(bookId)
			const sizeFilter = isOldTestament ? 'OT' : 'NT'

			// Filter filesets by size (OT or NT)
			const sizeFilteredFilesets = textFilesets.filter(
				(fs) => fs.size === sizeFilter
			)

			let filesetId
			let preferredFileset

			if (sizeFilteredFilesets.length === 0) {
				// console.log(
				//     `No ${sizeFilter} text filesets found for ${bibleId}. Available sizes:`,
				//     textFilesets.map((fs) => fs.size)
				// );
				// Fallback to any text fileset if size filtering fails
				preferredFileset =
					textFilesets.find((fs) => fs.type === 'text_json') ||
					textFilesets.find((fs) => fs.type === 'text_plain') ||
					textFilesets[0]
				filesetId = preferredFileset.id
				// console.log(
				//     `Using fallback fileset ${filesetId} (${preferredFileset.type}) for ${bibleId}`
				// );
			} else {
				// Prefer text_json, then text_plain, then text_usx for the correct size
				preferredFileset =
					sizeFilteredFilesets.find((fs) => fs.type === 'text_json') ||
					sizeFilteredFilesets.find((fs) => fs.type === 'text_plain') ||
					sizeFilteredFilesets[0]
				filesetId = preferredFileset.id
				// console.log(
				//     `Using ${sizeFilter} fileset ${filesetId} (${preferredFileset.type}) for ${bibleId}`
				// );
			}

			const response = await axios.get(
				`${this.baseUrl}/bibles/filesets/${filesetId}/${bookId}/${chapter}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			// Get the fileset type to determine how to process the content
			const filesetType = preferredFileset.type
			let chapterContentResponse

			if (filesetType === 'text_plain') {
				// For text_plain, the response contains individual verse objects directly
				// Process the verse data directly - structure it similar to text_json format
				const verses = response.data.data.map((verse) => ({
					verse: verse.verse_start,
					text: verse.verse_text,
					book_id: verse.book_id,
					book_name: verse.book_name,
					chapter: verse.chapter,
				}))

				// Create a structured response similar to text_json format
				chapterContentResponse = {
					book_id: bookId,
					book_name: response.data.data[0]?.book_name || bookId,
					chapter: chapter,
					verses: verses,
				}
			} else {
				// For other formats (text_json, text_usx), check if there's a path property
				const chapterContent = response.data.data[0]
				const chapterContentPath = chapterContent.path

				if (!chapterContentPath) {
					console.error(
						`ERROR: chapterContentPath is ${chapterContentPath} for ${filesetType} format`
					)
					throw new Error(
						`Chapter content path is missing or invalid for ${filesetType} format: ${chapterContentPath}`
					)
				}

				try {
					if (filesetType === 'text_json') {
						// JSON format - fetch and return as-is
						const { data } = await axios.get(chapterContentPath)
						chapterContentResponse = data
					} else if (filesetType === 'text_usx') {
						// USX format - fetch as text and wrap in a simple structure
						const { data } = await axios.get(chapterContentPath, {
							responseType: 'text',
						})
						chapterContentResponse = {
							type: 'usx',
							content: data,
							book: bookId,
							chapter: chapter,
						}
					} else {
						// Fallback - try to fetch as JSON
						const { data } = await axios.get(chapterContentPath)
						chapterContentResponse = data
					}
				} catch (contentError) {
					console.error(
						`Error fetching content for ${filesetType}:`,
						contentError
					)
					throw new Error(
						`Failed to fetch chapter content for ${filesetType} format`
					)
				}
			}

			// For text_plain, we need to create a proper chapterContent structure
			// that matches what the original code expected
			let chapterContent

			if (filesetType === 'text_plain') {
				// For text_plain, chapterContent should be the raw response data
				// and chapterContentResponse should be the processed structure
				chapterContent = response.data.data
			} else {
				// For other formats, chapterContent is the first item from the response
				chapterContent = response.data.data[0]
			}

			return {
				chapterContent: chapterContent,
				chapterContentResponse: chapterContentResponse,
				filesetType: filesetType,
			}
		} catch (error) {
			console.error(
				'Error fetching chapter:',
				error.response?.data || error.message
			)
			throw new Error('Failed to fetch chapter content')
		}
	}

	/**
	 * Get audio URL for a specific chapter
	 * @param {string} bibleId - Bible version ID
	 * @param {string} bookId - Book ID
	 * @param {number} chapter - Chapter number
	 * @param {boolean} includeTimestamps - Whether to include verse timestamps in the response
	 * @returns {Promise<Object>} Audio information
	 */
	async getChapterAudio(bibleId, bookId, chapter, includeTimestamps = false) {
		try {
			// First get the fileset ID for audio
			const bibleResponse = await axios.get(
				`${this.baseUrl}/bibles/${bibleId}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			// Extract filesets from the nested structure - the response has data.data.filesets
			const filesets = bibleResponse.data.data?.filesets?.['dbp-prod'] || []
			// console.log(
			//     `Available filesets for audio ${bibleId}:`,
			//     filesets.map((fs) => ({ id: fs.id, type: fs.type, size: fs.size }))
			// );

			// Find audio filesets - check for all available audio types
			const audioFilesets = filesets.filter(
				(fs) =>
					fs.type === 'audio' ||
					fs.type === 'audio_drama' ||
					fs.type === 'audio_stream' ||
					fs.type === 'audio_drama_stream' ||
					fs.type === 'audio_hls' ||
					fs.type === 'audio_drama_hls'
			)

			if (audioFilesets.length === 0) {
				return null // No audio available
			}

			// Determine if this is Old Testament or New Testament book
			const isOldTestament = this.isOldTestamentBook(bookId)
			const sizeFilter = isOldTestament ? 'OT' : 'NT'

			// Filter audio filesets by size (OT or NT)
			const sizeFilteredAudioFilesets = audioFilesets.filter(
				(fs) => fs.size === sizeFilter
			)

			// Get available timestamp filesets to prefer those with timestamps
			const availableTimestampFilesets =
				await this.getAvailableTimestampFilesets()

			let preferredFileset
			if (sizeFilteredAudioFilesets.length === 0) {
				// Fallback to any audio fileset if size filtering fails
				// Priority: HLS formats first, then drama, then regular audio
				// Within each type, prefer filesets with timestamps available
				preferredFileset =
					audioFilesets.find(
						(fs) =>
							fs.type === 'audio_hls' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					audioFilesets.find((fs) => fs.type === 'audio_hls') ||
					audioFilesets.find(
						(fs) =>
							fs.type === 'audio_drama_hls' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					audioFilesets.find((fs) => fs.type === 'audio_drama_hls') ||
					audioFilesets.find(
						(fs) =>
							fs.type === 'audio_drama' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					audioFilesets.find((fs) => fs.type === 'audio_drama') ||
					audioFilesets.find(
						(fs) =>
							fs.type === 'audio' && availableTimestampFilesets.includes(fs.id)
					) ||
					audioFilesets.find((fs) => fs.type === 'audio') ||
					audioFilesets.find(
						(fs) =>
							fs.type === 'audio_stream' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					audioFilesets.find((fs) => fs.type === 'audio_stream') ||
					audioFilesets.find(
						(fs) =>
							fs.type === 'audio_drama_stream' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					audioFilesets.find((fs) => fs.type === 'audio_drama_stream') ||
					audioFilesets[0]
			} else {
				// Prefer HLS formats, then drama, then regular audio for the correct size
				// Within each type, prefer filesets with timestamps available
				preferredFileset =
					sizeFilteredAudioFilesets.find(
						(fs) =>
							fs.type === 'audio_hls' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					sizeFilteredAudioFilesets.find((fs) => fs.type === 'audio_hls') ||
					sizeFilteredAudioFilesets.find(
						(fs) =>
							fs.type === 'audio_drama_hls' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					sizeFilteredAudioFilesets.find(
						(fs) => fs.type === 'audio_drama_hls'
					) ||
					sizeFilteredAudioFilesets.find(
						(fs) =>
							fs.type === 'audio_drama' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					sizeFilteredAudioFilesets.find((fs) => fs.type === 'audio_drama') ||
					sizeFilteredAudioFilesets.find(
						(fs) =>
							fs.type === 'audio' && availableTimestampFilesets.includes(fs.id)
					) ||
					sizeFilteredAudioFilesets.find((fs) => fs.type === 'audio') ||
					sizeFilteredAudioFilesets.find(
						(fs) =>
							fs.type === 'audio_stream' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					sizeFilteredAudioFilesets.find((fs) => fs.type === 'audio_stream') ||
					sizeFilteredAudioFilesets.find(
						(fs) =>
							fs.type === 'audio_drama_stream' &&
							availableTimestampFilesets.includes(fs.id)
					) ||
					sizeFilteredAudioFilesets.find(
						(fs) => fs.type === 'audio_drama_stream'
					) ||
					sizeFilteredAudioFilesets[0]
			}

			const filesetId = preferredFileset.id

			// Get audio URL
			const response = await axios.get(
				`${this.baseUrl}/bibles/filesets/${filesetId}/${bookId}/${chapter}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			const audioData = response.data.data

			// Fetch and merge timestamps only when explicitly requested
			// We already prefer filesets with timestamps available (checked above)
			if (includeTimestamps && availableTimestampFilesets.includes(filesetId)) {
				try {
					const timestamps = await this.getVerseTimestamps(
						filesetId,
						bookId,
						chapter
					)

					if (timestamps) {
						audioData[0].timestamp = timestamps
					}
				} catch (timestampError) {
					// If timestamps fail to fetch, log but don't fail the entire request
					console.warn(
						'Failed to fetch timestamps, continuing without them:',
						timestampError.message
					)
				}
			}

			return audioData
		} catch (error) {
			console.error(
				'Error fetching chapter audio:',
				error.response?.data || error.message
			)
			return null // Return null if audio not available
		}
	}

	/**
	 * Get all available audio formats for a Bible version
	 * @param {string} bibleId - Bible ID
	 * @returns {Promise<Object>} Object with available audio formats
	 */
	async getAvailableAudioFormats(bibleId) {
		try {
			const bibleResponse = await axios.get(
				`${this.baseUrl}/bibles/${bibleId}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			const filesets = bibleResponse.data.data?.filesets?.['dbp-prod'] || []

			// Find all audio filesets
			const audioFilesets = filesets.filter(
				(fs) =>
					fs.type === 'audio' ||
					fs.type === 'audio_drama' ||
					fs.type === 'audio_stream' ||
					fs.type === 'audio_drama_stream' ||
					fs.type === 'audio_hls' ||
					fs.type === 'audio_drama_hls'
			)

			// Group by type and size
			const formatsByType = {}
			const formatsBySize = {}

			audioFilesets.forEach((fs) => {
				if (!formatsByType[fs.type]) {
					formatsByType[fs.type] = []
				}
				formatsByType[fs.type].push({
					id: fs.id,
					size: fs.size,
					type: fs.type,
				})

				if (!formatsBySize[fs.size]) {
					formatsBySize[fs.size] = []
				}
				formatsBySize[fs.size].push({
					id: fs.id,
					size: fs.size,
					type: fs.type,
				})
			})

			return {
				bibleId,
				totalAudioFormats: audioFilesets.length,
				formatsByType,
				formatsBySize,
				allFormats: audioFilesets.map((fs) => ({
					id: fs.id,
					type: fs.type,
					size: fs.size,
				})),
			}
		} catch (error) {
			console.error('Error getting available audio formats:', error)
			throw new Error('Failed to get available audio formats')
		}
	}

	/**
	 * Get list of fileset IDs that have timestamps available
	 * @returns {Promise<Array>} Array of fileset IDs with timestamp data
	 */
	async getAvailableTimestampFilesets() {
		try {
			const response = await axios.get(`${this.baseUrl}/timestamps`, {
				params: {
					v: 4,
					key: this.apiKey,
				},
			})

			// The response should be an array of objects with fileset_id property
			return response.data.map((item) => item.fileset_id)
		} catch (error) {
			console.error(
				'Error fetching available timestamp filesets:',
				error.response?.data || error.message
			)
			return [] // Return empty array if API fails
		}
	}

	/**
	 * Get verse timestamps for audio
	 * @param {string} filesetId - Audio fileset ID
	 * @param {string} bookId - Book ID
	 * @param {number} chapter - Chapter number
	 * @returns {Promise<Array>} Array of verse timestamps
	 */
	async getVerseTimestamps(filesetId, bookId, chapter) {
		try {
			const response = await axios.get(
				`${this.baseUrl}/timestamps/${filesetId}/${bookId}/${chapter}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			return response.data.data
		} catch (error) {
			console.error(
				'Error fetching verse timestamps:',
				error.response?.data || error.message
			)
			return null // Return null if timestamps not available
		}
	}

	/**
	 * Search Bible text
	 * @param {string} filesetId - Fileset ID for search
	 * @param {string} query - Search query
	 * @param {Object} options - Search options
	 * @returns {Promise<Object>} Search results
	 */
	async searchBible(filesetId, query, options = {}) {
		try {
			const params = {
				query: query,
				fileset_id: filesetId,
				limit: options.limit || 20,
				page: options.page || 1,
				books: options.books || '',
				v: 4,
				key: this.apiKey,
			}

			const response = await axios.get(`${this.baseUrl}/search`, {
				params,
			})

			return {
				query: response.data.query,
				limit: response.data.meta.pagination.per_page,
				offset:
					(response.data.meta.pagination.current_page - 1) *
					response.data.meta.pagination.per_page,
				total: response.data.meta.pagination.total,
				verseCount: response.data.meta.pagination.total,
				results: response.data.verses.data,
			}
		} catch (error) {
			console.error(
				'Error searching Bible:',
				error.response?.data || error.message
			)
			throw new Error('Failed to search Bible')
		}
	}

	/**
	 * Get copyright information for a Bible version
	 * @param {string} bibleId - Bible version ID
	 * @returns {Promise<Object>} Copyright information
	 */
	async getCopyright(bibleId) {
		try {
			const response = await axios.get(
				`${this.baseUrl}/bibles/${bibleId}/copyright`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			return response.data
		} catch (error) {
			console.error(
				'Error fetching copyright:',
				error.response?.data || error.message
			)
			throw new Error('Failed to fetch copyright information')
		}
	}

	/**
	 * Get all Bible versions (fetches all pages)
	 * @param {string} languageCode - Language code (default: 'eng')
	 * @returns {Promise<Array>} Complete array of Bible versions
	 */
	async getAllBibleVersions(languageCode = 'eng') {
		try {
			let allBibles = []
			let currentPage = 1
			let hasMorePages = true

			while (hasMorePages) {
				const result = await this.getBibleVersions({
					page: currentPage,
					limit: 25,
					language_code: languageCode,
				})

				allBibles = allBibles.concat(result.data)

				if (result.pagination) {
					hasMorePages = currentPage < result.pagination.total_pages
					currentPage++
				} else {
					hasMorePages = false
				}
			}

			return allBibles
		} catch (error) {
			console.error('Error fetching all Bible versions:', error)
			throw new Error('Failed to fetch all Bible versions')
		}
	}

	/**
	 * Get all books for a Bible version (fetches all pages)
	 * @param {string} bibleId - Bible version ID
	 * @returns {Promise<Array>} Complete array of books
	 */
	async getAllBooks(bibleId) {
		try {
			let allBooks = []
			let currentPage = 1
			let hasMorePages = true

			while (hasMorePages) {
				const result = await this.getBooks(bibleId, {
					page: currentPage,
					limit: 25,
				})

				allBooks = allBooks.concat(result.data)

				if (result.pagination) {
					hasMorePages = currentPage < result.pagination.total_pages
					currentPage++
				} else {
					hasMorePages = false
				}
			}

			return allBooks
		} catch (error) {
			console.error('Error fetching all books:', error)
			throw new Error('Failed to fetch all books')
		}
	}

	/**
	 * Get chapter content in JSON format (structured for UI display)
	 * @param {string} bibleId - Bible version ID
	 * @param {string} bookId - Book ID
	 * @param {number} chapter - Chapter number
	 * @returns {Promise<Object>} Chapter content in JSON format
	 */
	async getChapterJSON(bibleId, bookId, chapter) {
		try {
			// First get the fileset ID for JSON content
			const bibleResponse = await axios.get(
				`${this.baseUrl}/bibles/${bibleId}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			// Extract filesets from the nested structure
			const filesets = bibleResponse.data.data?.filesets?.['dbp-prod'] || []

			// Determine if this is Old Testament or New Testament book
			const isOldTestament = this.isOldTestamentBook(bookId)
			const sizeFilter = isOldTestament ? 'OT' : 'NT'

			// Find JSON filesets for the correct size
			const jsonFilesets = filesets.filter(
				(fs) => fs.type === 'text_json' && fs.size === sizeFilter
			)

			let filesetId
			if (jsonFilesets.length === 0) {
				// console.log(
				//     `No ${sizeFilter} JSON filesets found for ${bibleId}. Available types:`,
				//     filesets.map((fs) => ({ type: fs.type, size: fs.size }))
				// );

				// Fallback to any JSON fileset if size filtering fails
				const allJsonFilesets = filesets.filter((fs) => fs.type === 'text_json')
				if (allJsonFilesets.length === 0) {
					throw new Error(`No JSON filesets available for ${bibleId}`)
				}

				filesetId = allJsonFilesets[0].id
				// console.log(
				//     `Using fallback JSON fileset ${filesetId} for ${bibleId}`
				// );
			} else {
				filesetId = jsonFilesets[0].id
				// console.log(
				//     `Using ${sizeFilter} JSON fileset ${filesetId} for ${bibleId} ${bookId} ${chapter}`
				// );
			}

			const response = await axios.get(
				`${this.baseUrl}/bibles/filesets/${filesetId}/${bookId}/${chapter}`,
				{
					params: {
						v: 4,
						key: this.apiKey,
					},
				}
			)

			return response.data.data
		} catch (error) {
			console.error(
				'Error fetching chapter JSON:',
				error.response?.data || error.message
			)
			throw new Error('Failed to fetch chapter JSON content')
		}
	}
}

module.exports = new BibleApiService()
