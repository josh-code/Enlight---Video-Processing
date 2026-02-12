const Joi = require('joi')

const multiLanguageContentSchema = Joi.object()
	.pattern(Joi.string().length(2), Joi.string().required())
	.min(1)

module.exports = { multiLanguageContentSchema }
