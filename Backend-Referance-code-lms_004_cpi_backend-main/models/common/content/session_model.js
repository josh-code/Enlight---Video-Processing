const Joi = require('joi')
const { Schema, model } = require('mongoose')
const { multiLanguageContentSchema } = require('../../../utils/validator')

const SessionSchema = Schema(
	{
		name: {
			type: Map,
			of: String,
			required: true,
			validate: {
				validator: function (value) {
					return value && value.size > 0
				},
				message: 'At least one language must be provided for session name',
			},
		},
		image: {
			type: String,
		},
		description: {
			type: Map,
			of: String,
		},
		video: {
			type: Map,
			of: String,
		},
		attachment: {
			type: Map,
			of: String,
		},
		duration: {
			type: Map,
			of: Number,
		},
		order: {
			type: Number,
		},
		moduleId: {
			type: Schema.Types.ObjectId,
			ref: 'Module',
		},
		courseId: {
			type: Schema.Types.ObjectId,
			ref: 'Course',
			required: true,
		},
		transcribe: {
			type: Map,
			of: String,
		},
		hls: {
			type: Map,
			of: new Schema({
				jobId: String,
				status: String,
				outputPrefix: String,
				url: String,
				createdAt: Date,
				updatedAt: Date,
				error: {
					code: String,
					message: String,
				},
			}),
		},
		availableLanguages: [
			{
				type: String,
				required: true,
			},
		],
	},
	{
		timestamps: true,
	}
)

// Virtual for getting session in specific language (without HLS URLs)
SessionSchema.virtual('localized', {
	get: function () {
		return (language) => {
			const localized = {
				_id: this._id,
				name: this.name.get(language) || this.name.get('en'),
				description:
					this.description.get(language) || this.description.get('en'),
				duration: this.duration.get(language) || this.duration.get('en'),
				quiz: this.quiz.get(language) || this.quiz.get('en'),
				transcribe: this.transcribe.get(language) || this.transcribe.get('en'),
				order: this.order,
				image: this.image,
				audio: this.audio,
				attachment: this.attachment,
				moduleId: this.moduleId,
				courseId: this.courseId,
				availableLanguages: this.availableLanguages,
				// Note: HLS URLs are NOT included here - accessed via separate route
			}
			return localized
		}
	},
})

// Method to get HLS URL for specific language
SessionSchema.methods.getHlsUrl = function (language) {
	const hlsData = this.hls.get(language)
	return hlsData ? hlsData.url : null
}

const Session = model('Session', SessionSchema)

function validateSession(req) {
	const schema = Joi.object({
		name: multiLanguageContentSchema.required(),
		description: multiLanguageContentSchema,
		video: multiLanguageContentSchema,
		attachment: Joi.object({
			key: Joi.string().required(),
			size: Joi.number().required(),
			name: Joi.string().required(),
			type: Joi.string().required(),
		}).optional(),
		duration: multiLanguageContentSchema,
		quiz: Joi.object(), // Can be multi-language object
		courseId: Joi.string().required(),
		moduleId: Joi.optional(),
		order: Joi.number(),
		transcribe: multiLanguageContentSchema,
		hls: Joi.object(), // Dynamic structure
		availableLanguages: Joi.array().items(Joi.string().length(2)),
	})

	return schema.validate(req)
}

exports.Session = Session
exports.validateSession = validateSession
