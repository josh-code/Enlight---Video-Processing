const slugify = require('slugify')

/**
 * Generates a unique slug from a given text string
 * @param {string} text - The text to convert to a slug
 * @param {Object} options - Optional configuration
 * @param {string} options.separator - Separator for words (default: '-')
 * @param {boolean} options.lower - Convert to lowercase (default: true)
 * @param {boolean} options.strict - Remove special characters (default: true)
 * @param {string} options.locale - Locale for slugification (default: 'en')
 * @returns {string} - The generated slug
 */
function generateSlug(text, options = {}) {
	const defaultOptions = {
		separator: '-',
		lower: true,
		strict: true,
		locale: 'en',
		...options,
	}

	if (!text || typeof text !== 'string') {
		throw new Error('Text must be a non-empty string')
	}

	return slugify(text, defaultOptions)
}

/**
 * Generates a unique slug by checking against existing slugs in the database
 * If the slug already exists, appends a number suffix (e.g., -1, -2, etc.)
 * @param {string} text - The text to convert to a slug
 * @param {Object} model - Mongoose model to check for existing slugs
 * @param {string} slugField - Field name in the model that contains the slug (default: 'slug')
 * @param {string} excludeId - Optional document ID to exclude from uniqueness check (useful for updates)
 * @param {Object} slugOptions - Options for slug generation (passed to generateSlug)
 * @returns {Promise<string>} - A unique slug
 */
async function generateUniqueSlug(
	text,
	model,
	slugField = 'slug',
	excludeId = null,
	slugOptions = {}
) {
	if (!text || typeof text !== 'string') {
		throw new Error('Text must be a non-empty string')
	}

	if (!model) {
		throw new Error('Model is required for uniqueness check')
	}

	const baseSlug = generateSlug(text, slugOptions)
	let slug = baseSlug
	let counter = 1

	// Check if slug exists using aggregation for better performance
	while (true) {
		// Build query to check for existing slug
		const matchQuery = { [slugField]: slug }
		if (excludeId) {
			matchQuery._id = { $ne: excludeId }
		}

		const existingDoc = await model
			.aggregate([
				{
					$match: matchQuery,
				},
				{
					$limit: 1,
				},
				{
					$project: {
						_id: 1,
					},
				},
			])
			.exec()

		if (existingDoc.length === 0) {
			break
		}

		// Slug exists, append counter
		slug = `${baseSlug}-${counter}`
		counter++
	}

	return slug
}

module.exports = {
	generateSlug,
	generateUniqueSlug,
}
