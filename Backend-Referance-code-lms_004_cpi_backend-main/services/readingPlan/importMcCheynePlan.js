const fs = require('fs')
const path = require('path')
const { ReadingPlan } = require('../../models/common/reading_plan_model')
const { ReadingPlanDay } = require('../../models/common/reading_plan_day_model')
const BIBLE_CONSTANTS = require('../../constants/bible')

// Reverse mapping from book ID to full book name
const BOOK_ID_TO_NAME = {}
Object.entries(BIBLE_CONSTANTS.BOOK_MAPPING).forEach(([fullName, bookId]) => {
	BOOK_ID_TO_NAME[bookId] = fullName
})

function parseReference(reference) {
	// Handle empty or invalid references
	if (!reference || typeof reference !== 'string' || !reference.trim()) {
		return null
	}

	const trimmedRef = reference.trim()

	// Try to find the book name by checking against our mapping
	// We need to handle multi-word book names like "1 Corinthians", "Song of Solomon"
	let bookName = ''
	let remainingText = ''

	// Split by spaces and try different combinations
	const words = trimmedRef.split(' ')

	// Try different word combinations to find a valid book name
	for (let i = 1; i <= words.length; i++) {
		const potentialBookName = words.slice(0, i).join(' ')
		if (BIBLE_CONSTANTS.BOOK_MAPPING[potentialBookName]) {
			bookName = potentialBookName
			remainingText = words.slice(i).join(' ')
			break
		}
	}

	// If no book found, use the first word as fallback
	if (!bookName) {
		bookName = words[0]
		remainingText = words.slice(1).join(' ')
	}

	const book = BIBLE_CONSTANTS.BOOK_MAPPING[bookName] || bookName

	// If no remaining text, assume chapter 1
	if (!remainingText) {
		return [{ book, chapter: 1, verseStart: null, verseEnd: null }]
	}

	// Parse the remaining text for chapter and verses
	if (remainingText.includes(':')) {
		// Handle cases like "5:1-6:11" (cross-chapter verse ranges)
		if (remainingText.includes('-') && remainingText.includes(':')) {
			const [startPart, endPart] = remainingText.split('-')

			// Check if end part has a colon (cross-chapter range)
			if (endPart.includes(':')) {
				const [startChapter, startVerse] = startPart.split(':')
				const [endChapter, endVerse] = endPart.split(':')

				const startChapterNum = parseInt(startChapter)
				const startVerseNum = parseInt(startVerse)
				const endChapterNum = parseInt(endChapter)
				const endVerseNum = parseInt(endVerse)

				// Validate all numbers
				if (
					isNaN(startChapterNum) ||
					isNaN(startVerseNum) ||
					isNaN(endChapterNum) ||
					isNaN(endVerseNum) ||
					startChapterNum < 1 ||
					startVerseNum < 1 ||
					endChapterNum < 1 ||
					endVerseNum < 1
				) {
					console.warn(
						`Invalid cross-chapter range: ${remainingText} in reference: ${reference}`
					)
					return null
				}

				// Create separate passages for each chapter
				const passages = []
				for (
					let chapter = startChapterNum;
					chapter <= endChapterNum;
					chapter++
				) {
					if (chapter === startChapterNum) {
						// First chapter: from startVerse to end of chapter
						passages.push({
							book,
							chapter,
							verseStart: startVerseNum,
							verseEnd: null, // End of chapter
						})
					} else if (chapter === endChapterNum) {
						// Last chapter: from beginning to endVerse
						passages.push({
							book,
							chapter,
							verseStart: null, // Beginning of chapter
							verseEnd: endVerseNum,
						})
					} else {
						// Middle chapters: entire chapter
						passages.push({
							book,
							chapter,
							verseStart: null,
							verseEnd: null,
						})
					}
				}
				return passages
			} else {
				// Handle cases like "1:1-38" (single chapter verse range)
				// We need to split the original remainingText, not startPart
				const [chapter, verses] = remainingText.split(':')
				const chapterNum = parseInt(chapter)
				const [start, end] = verses.split('-')
				const startNum = parseInt(start)
				const endNum = parseInt(end)

				// Validate chapter and verse numbers
				if (
					isNaN(chapterNum) ||
					isNaN(startNum) ||
					isNaN(endNum) ||
					chapterNum < 1 ||
					startNum < 1 ||
					endNum < 1
				) {
					console.warn(
						`Invalid verse range: ${start}-${end} in reference: ${reference}`
					)
					return null
				}

				return [
					{
						book,
						chapter: chapterNum,
						verseStart: startNum,
						verseEnd: endNum,
					},
				]
			}
		} else {
			// Handle cases like "5:1" (single verse)
			const [chapter, verses] = remainingText.split(':')
			const chapterNum = parseInt(chapter)
			const verseNum = parseInt(verses)

			// Validate chapter and verse numbers
			if (
				isNaN(chapterNum) ||
				isNaN(verseNum) ||
				chapterNum < 1 ||
				verseNum < 1
			) {
				console.warn(
					`Invalid verse number: ${verses} in reference: ${reference}`
				)
				return null
			}

			return [
				{
					book,
					chapter: chapterNum,
					verseStart: verseNum,
					verseEnd: verseNum,
				},
			]
		}
	} else {
		// Handle chapter ranges like "4-5" or single chapters like "4"
		if (remainingText.includes('-')) {
			const [startChapter, endChapter] = remainingText.split('-')
			const startChapterNum = parseInt(startChapter)
			const endChapterNum = parseInt(endChapter)

			// Validate chapter numbers
			if (
				isNaN(startChapterNum) ||
				isNaN(endChapterNum) ||
				startChapterNum < 1 ||
				endChapterNum < 1
			) {
				console.warn(
					`Invalid chapter range: ${startChapter}-${endChapter} in reference: ${reference}`
				)
				return null
			}

			// Create separate passages for each chapter
			const passages = []
			for (let chapter = startChapterNum; chapter <= endChapterNum; chapter++) {
				passages.push({
					book,
					chapter,
					verseStart: null,
					verseEnd: null,
				})
			}
			return passages
		} else {
			// Handle single chapter like "4"
			const chapterNum = parseInt(remainingText)

			// Validate chapter number
			if (isNaN(chapterNum) || chapterNum < 1) {
				console.warn(
					`Invalid chapter number: ${remainingText} in reference: ${reference}`
				)
				return null
			}

			return [
				{
					book,
					chapter: chapterNum,
					verseStart: null,
					verseEnd: null,
				},
			]
		}
	}
}

function determinePassageType(book) {
	const oldTestamentBooks = BIBLE_CONSTANTS.BIBLE_BOOKS.OLD_TESTAMENT
	const newTestamentBooks = BIBLE_CONSTANTS.BIBLE_BOOKS.NEW_TESTAMENT

	if (oldTestamentBooks.includes(book)) {
		return book === 'PSA' ? 'psalms' : 'old_testament'
	} else if (newTestamentBooks.includes(book)) {
		return book === 'ACT' ? 'acts' : 'new_testament'
	}
	return 'custom'
}

async function importMcCheynePlan(year = new Date().getFullYear()) {
	try {
		// Read CSV file
		const csvPath = path.join(__dirname, '../../assets/Daily-Reading-MC.csv')
		const csvContent = fs.readFileSync(csvPath, 'utf8')

		const lines = csvContent.split('\n').filter((line) => line.trim())

		// Create or update reading plan
		let plan = await ReadingPlan.findOne({
			name: "M'Cheyne One Year Bible Plan",
			year,
		})

		if (!plan) {
			plan = new ReadingPlan({
				name: "M'Cheyne One Year Bible Plan",
				description:
					'A systematic reading plan that takes you through the entire Bible in one year with daily readings from Old Testament, New Testament, and additional passages.',
				version: '1.0',
				totalDays: 365,
				year,
				startDate: new Date(year, 0, 1), // January 1st
				endDate: new Date(year, 11, 31), // December 31st
				metadata: {
					source: 'MCheyne CSV',
					planType: 'yearly',
					features: ['old_testament', 'new_testament', 'mixed_passages'],
				},
			})
			await plan.save()
		}

		// Clear existing days for this plan
		await ReadingPlanDay.deleteMany({ planId: plan._id })

		// Process each day
		const planDays = []

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const [dateStr, dayStr, oldTestament, newTestament, psalms, acts] =
				line.split(',')

			if (!dateStr || !dayStr) continue

			const dayNumber = i + 1
			const [month, day] = dayStr.split('-')
			// Store dates at midnight UTC to avoid timezone conversion issues
			// This ensures dates match user queries regardless of server timezone
			const date = new Date(
				Date.UTC(year, parseInt(month) - 1, parseInt(day), 0, 0, 0, 0)
			)

			const passages = []

			// Process each passage type
			// Note: CSV columns are: Date, Day, Old Testament, New Testament, Mixed (Psalms/Other OT), New Testament
			const passageTypes = [
				{ type: 'old_testament', reference: oldTestament },
				{ type: 'new_testament', reference: newTestament },
				{ type: 'mixed', reference: psalms }, // This could be Psalms or other OT books
				{ type: 'new_testament', reference: acts }, // This is actually NT books, not just Acts
			]

			passageTypes.forEach((passage, index) => {
				if (passage.reference && passage.reference.trim()) {
					const parsedPassages = parseReference(passage.reference.trim())

					// Only add passages if parsing was successful
					if (parsedPassages && Array.isArray(parsedPassages)) {
						parsedPassages.forEach((parsed, subIndex) => {
							const actualType = determinePassageType(parsed.book)

							// Create title for individual passage using full book name
							const fullBookName = BOOK_ID_TO_NAME[parsed.book] || parsed.book
							let title = `${fullBookName} ${parsed.chapter}`
							if (parsed.verseStart && parsed.verseEnd) {
								if (parsed.verseStart === parsed.verseEnd) {
									title += `:${parsed.verseStart}`
								} else {
									title += `:${parsed.verseStart}-${parsed.verseEnd}`
								}
							} else if (parsed.verseStart) {
								title += `:${parsed.verseStart}`
							}

							passages.push({
								type: actualType,
								reference: passage.reference.trim(), // Keep original reference
								title: title, // Add individual title
								book: parsed.book,
								chapter: parsed.chapter,
								verseStart: parsed.verseStart,
								verseEnd: parsed.verseEnd,
								metadata: {
									originalType: passage.type,
									passageIndex: index,
									subPassageIndex: subIndex,
									totalSubPassages: parsedPassages.length,
								},
							})
						})
					} else {
						console.warn(
							`Skipping invalid reference: ${passage.reference} on day ${dayNumber}`
						)
					}
				}
			})

			if (passages.length > 0) {
				planDays.push({
					planId: plan._id,
					dayNumber,
					date,
					passages,
					isActive: true,
					metadata: {
						csvRow: i + 1,
						dateString: dateStr,
					},
				})
			}
		}

		// Insert all days
		await ReadingPlanDay.insertMany(planDays)

		console.log(
			`Successfully imported M'Cheyne plan for ${year} with ${planDays.length} days`
		)
		return { plan, daysCount: planDays.length }
	} catch (error) {
		console.error("Error importing M'Cheyne plan:", error)
		throw error
	}
}

module.exports = {
	importMcCheynePlan,
	parseReference,
	determinePassageType,
	BOOK_ID_TO_NAME,
}
