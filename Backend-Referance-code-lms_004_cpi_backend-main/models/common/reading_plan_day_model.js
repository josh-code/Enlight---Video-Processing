const { Schema, model } = require('mongoose')
const Joi = require('joi')

const readingPlanDaySchema = Schema(
	{
		planId: {
			type: Schema.Types.ObjectId,
			ref: 'ReadingPlan',
			required: true,
		},
		dayNumber: {
			type: Number,
			required: true,
			min: 1,
		},
		date: {
			type: Date,
			required: true,
		},
		passages: [
			{
				type: {
					type: String,
					enum: ['old_testament', 'new_testament', 'psalms', 'acts', 'custom'],
					required: true,
				},
				reference: {
					type: String,
					required: true,
				},
				title: {
					type: String,
					required: false,
				},
				book: {
					type: String,
					required: true,
				},
				chapter: {
					type: Number,
					required: true,
				},
				verseStart: {
					type: Number,
					required: false,
				},
				verseEnd: {
					type: Number,
					required: false,
				},
				metadata: {
					type: Schema.Types.Mixed,
					default: {},
				},
			},
		],
		isActive: {
			type: Boolean,
			default: true,
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

// Compound index for efficient queries
readingPlanDaySchema.index({ planId: 1, dayNumber: 1 }, { unique: true })
readingPlanDaySchema.index({ planId: 1, date: 1 })

const ReadingPlanDay = model('ReadingPlanDay', readingPlanDaySchema)

function validateReadingPlanDay(req) {
	const schema = Joi.object({
		planId: Joi.string().required(),
		dayNumber: Joi.number().integer().min(1).required(),
		date: Joi.date().required(),
		passages: Joi.array()
			.items(
				Joi.object({
					type: Joi.string()
						.valid('old_testament', 'new_testament', 'psalms', 'acts', 'custom')
						.required(),
					reference: Joi.string().required(),
					book: Joi.string().required(),
					chapter: Joi.number().integer().min(1).required(),
					verseStart: Joi.number().integer().min(1).optional(),
					verseEnd: Joi.number().integer().min(1).optional(),
					metadata: Joi.object(),
				})
			)
			.min(1)
			.required(),
		isActive: Joi.boolean(),
		metadata: Joi.object(),
	})
	return schema.validate(req)
}

exports.ReadingPlanDay = ReadingPlanDay
exports.validateReadingPlanDay = validateReadingPlanDay
