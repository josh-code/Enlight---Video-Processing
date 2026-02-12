const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)
const { Schema, model } = require('mongoose')

const UserProgressSchema = Schema(
	{
		progress: [Object],
		userId: {
			type: Schema.Types.Mixed,
			required: true,
		},
		currentSemsterId: {
			type: Schema.Types.Mixed,
		},
		currentCourseId: {
			type: Schema.Types.Mixed,
		},
		currentSessionId: {
			type: Schema.Types.Mixed,
		},
		sessionProgress: Object,
		completedCourses: [
			{
				course: {
					type: Schema.Types.ObjectId,
					ref: 'Course',
				},
				completedAt: {
					type: Date,
					default: Date.now,
				},
			},
		],
	},
	{
		timestamps: true,
	}
)

const UserProgress = model('UserProgress', UserProgressSchema)

function validateUserProgress(req) {
	const schema = Joi.object({
		languageId: Joi.string().allow(undefined).optional(),
		progress: Joi.array(),
		userId: Joi.objectId().required(),
		currentSemsterId: Joi.objectId().allow(undefined).optional(),
		currentCourseId: Joi.objectId().allow(undefined).optional(),
		currentSessionId: Joi.objectId().allow(undefined).optional(),
		sessionProgress: Joi.object(),

		completedCourses: Joi.array(),
	})
	return schema.validate(req)
}

exports.UserProgress = UserProgress
exports.validateUserProgress = validateUserProgress
