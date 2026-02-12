const { Schema, model } = require('mongoose')
const Joi = require('joi')

const readingPlanSchema = Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			required: true,
		},
		version: {
			type: String,
			required: true,
			default: '1.0',
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		totalDays: {
			type: Number,
			required: true,
		},
		year: {
			type: Number,
			required: true,
			default: new Date().getFullYear(),
		},
		startDate: {
			type: Date,
			required: true,
		},
		endDate: {
			type: Date,
			required: true,
		},
		metadata: {
			type: Schema.Types.Mixed,
			default: {},
		},
	},
	{
		timestamps: true,
	}
)

// Compound unique index: name + year (allows same name for different years)
readingPlanSchema.index({ name: 1, year: 1 }, { unique: true })

const ReadingPlan = model('ReadingPlan', readingPlanSchema)

function validateReadingPlan(req) {
	const schema = Joi.object({
		name: Joi.string().required().max(100),
		description: Joi.string().required().max(500),
		version: Joi.string().max(20),
		isActive: Joi.boolean(),
		totalDays: Joi.number().integer().min(1).required(),
		year: Joi.number().integer().min(2020).max(2030),
		startDate: Joi.date().required(),
		endDate: Joi.date().required(),
		metadata: Joi.object(),
	})
	return schema.validate(req)
}

exports.ReadingPlan = ReadingPlan
exports.validateReadingPlan = validateReadingPlan
