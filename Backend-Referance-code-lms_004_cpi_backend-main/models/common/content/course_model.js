const Joi = require('joi')
const { Schema, model } = require('mongoose')
const { generateUniqueSlug } = require('../../../utils/slugify')
const { multiLanguageContentSchema } = require('../../../utils/validator')

const CourseSchema = Schema(
	{
		name: {
			type: Map,
			of: String,
			required: true,
			validate: {
				validator: function (value) {
					return value && value.size > 0
				},
				message: 'At least one language must be provided for course name',
			},
		},
		order: {
			type: Number,
		},
		image: {
			type: String,
		},
		slug: {
			type: String,
			required: true,
			unique: true,
		},
		description: {
			type: Map,
			of: String,
		},
		presentedBy: {
			type: String,
		},
		instructorImage: {
			type: String,
		},
		isModular: {
			type: Boolean,
		},
		isDraft: {
			type: Boolean,
			default: true,
		},
		introVideo: {
			type: Map,
			of: String,
		},
		introVideoTranscribe: {
			type: Map,
			of: String,
		},
		modules: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Module',
			},
		],
		sessions: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Session',
			},
		],
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

// Virtual for getting course in specific language
CourseSchema.virtual('localized', {
	get: function () {
		return (language) => {
			const localized = {
				_id: this._id,
				name: this.name.get(language) || this.name.get('en'), // Fallback to English
				description:
					this.description.get(language) || this.description.get('en'),
				introVideo: this.introVideo.get(language) || this.introVideo.get('en'),
				introVideoTranscribe:
					this.introVideoTranscribe.get(language) ||
					this.introVideoTranscribe.get('en'),
				order: this.order,
				image: this.image,
				slug: this.slug,
				presentedBy: this.presentedBy,
				instructorImage: this.instructorImage,
				isModular: this.isModular,
				isDraft: this.isDraft,
				availableLanguages: this.availableLanguages,
			}
			return localized
		}
	},
})

const Course = model('Course', CourseSchema)

/**
 * Generate a unique slug for a course based on the course name
 * Uses aggregation pipeline for efficient uniqueness checking
 * @param {string} courseName - The course name (typically from name.en)
 * @param {string} excludeId - Optional course ID to exclude from uniqueness check
 * @returns {Promise<string>} - A unique slug
 */
Course.generateUniqueSlug = async function (courseName, excludeId = null) {
	return generateUniqueSlug(courseName, this, 'slug', excludeId)
}

function validateCourse(req, isUpdate = false) {
	const schema = Joi.object({
		name: multiLanguageContentSchema.required(),
		order: Joi.number(),
		slug: isUpdate ? Joi.string().optional() : Joi.string().optional(),
		description: multiLanguageContentSchema,
		presentedBy: Joi.string(),
		instructorImage: Joi.string(),
		image: Joi.string().optional(),
		introVideo: multiLanguageContentSchema,
		introVideoTranscribe: multiLanguageContentSchema,
		isModular: Joi.boolean(),
		availableLanguages: Joi.array().items(Joi.string().length(2)),
		releasedLanguages: Joi.array().items(Joi.string().length(2)),
	})

	return schema.validate(req)
}

exports.Course = Course
exports.validateCourse = validateCourse
