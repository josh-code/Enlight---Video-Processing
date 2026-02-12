const { Schema, model } = require('mongoose')
const Joi = require('joi')

const userReadingProgressSchema = Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		planId: {
			type: Schema.Types.ObjectId,
			ref: 'ReadingPlan',
			required: true,
		},
		dayId: {
			type: Schema.Types.ObjectId,
			ref: 'ReadingPlanDay',
			required: true,
		},
		dayNumber: {
			type: Number,
			required: true,
		},
		completedAt: {
			type: Date,
			default: null,
		},
		passagesProgress: [
			{
				passageIndex: {
					type: Number,
					required: true,
				},
				completed: {
					type: Boolean,
					default: false,
				},
			},
		],
		lastStreakDate: {
			type: Date,
			default: null,
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
userReadingProgressSchema.index(
	{ userId: 1, planId: 1, dayNumber: 1 },
	{ unique: true }
)
userReadingProgressSchema.index({ userId: 1, planId: 1, completedAt: 1 })
userReadingProgressSchema.index({ userId: 1, planId: 1, lastStreakDate: 1 })

const UserReadingProgress = model(
	'UserReadingProgress',
	userReadingProgressSchema
)

function validateUserReadingProgress(req) {
	const schema = Joi.object({
		userId: Joi.string().required(),
		planId: Joi.string().required(),
		dayId: Joi.string().required(),
		dayNumber: Joi.number().integer().min(1).required(),
		completedAt: Joi.date().allow(null),
		passagesProgress: Joi.array().items(
			Joi.object({
				passageIndex: Joi.number().integer().min(0).required(),
				completed: Joi.boolean(),
			})
		),
		lastStreakDate: Joi.date().allow(null),
		metadata: Joi.object(),
	})
	return schema.validate(req)
}

exports.UserReadingProgress = UserReadingProgress
exports.validateUserReadingProgress = validateUserReadingProgress
