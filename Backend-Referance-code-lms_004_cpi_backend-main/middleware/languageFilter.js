const {
	SUPPORTED_LANGUAGES,
	DEFAULT_LANGUAGE,
} = require('../constants/supportedLanguage')
const Joi = require('joi')

// Validation schema for language query param
const languageQuerySchema = Joi.object({
	lang: Joi.string()
		.valid(...SUPPORTED_LANGUAGES)
		.default(DEFAULT_LANGUAGE)
		.optional(),
})

/**
 * Middleware to extract and validate language from query parameters
 */
const extractLanguage = (req, res, next) => {
	// Only validate the 'lang' parameter, allow other query params
	const { error, value } = languageQuerySchema.validate(
		{ lang: req.query.lang },
		{
			allowUnknown: true,
			stripUnknown: false,
		}
	)

	if (error) {
		return res.status(400).json({
			error: 'Invalid language code',
			supportedLanguages: SUPPORTED_LANGUAGES,
		})
	}

	req.language = value.lang || DEFAULT_LANGUAGE
	next()
}

/**
 * Helper function to localize Mongoose documents
 */
const localizeDocument = (doc, language) => {
	if (doc && typeof doc.localized === 'function') {
		return doc.localized(language)
	}
	return doc
}

/**
 * Helper function to localize arrays of documents
 */
const localizeDocuments = (docs, language) => {
	if (Array.isArray(docs)) {
		return docs.map((doc) => localizeDocument(doc, language))
	}
	return docs
}

/**
 * Helper function to aggregate course/module/session data for specific language
 */
const aggregateLocalizedContent = async (
	Model,
	query,
	language,
	populate = []
) => {
	let mongooseQuery = Model.find(query)

	// Apply population if specified
	populate.forEach((pop) => {
		mongooseQuery = mongooseQuery.populate(pop)
	})

	const documents = await mongooseQuery

	// Localize each document
	return localizeDocuments(documents, language)
}

module.exports = {
	extractLanguage,
	localizeDocument,
	localizeDocuments,
	aggregateLocalizedContent,
}
