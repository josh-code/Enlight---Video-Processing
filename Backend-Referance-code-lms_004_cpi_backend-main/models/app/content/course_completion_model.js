const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)
const { Schema, model } = require('mongoose')
const { SessionWatchProgress } = require('./session_watch_progress_model')
const { Session } = require('../../common/content/session_model')

const CourseCompletionSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		courseId: {
			type: Schema.Types.ObjectId,
			ref: 'Course',
			required: true,
			index: true,
		},
		// Completion percentage (0-100)
		completionPercentage: {
			type: Number,
			default: 0,
			min: 0,
			max: 100,
		},
		// Number of sessions completed
		sessionsCompleted: {
			type: Number,
			default: 0,
		},
		// Total sessions in course
		totalSessions: {
			type: Number,
			required: true,
		},
		// Whether course is fully completed
		isCompleted: {
			type: Boolean,
			default: false,
			index: true,
		},
		// When course was started
		startedAt: {
			type: Date,
			default: Date.now,
		},
		// When course was completed
		completedAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
)

// Compound unique index - one completion per user per course (language-agnostic)
CourseCompletionSchema.index({ userId: 1, courseId: 1 }, { unique: true })
CourseCompletionSchema.index({ userId: 1, isCompleted: 1 })

// Method to update completion percentage
CourseCompletionSchema.methods.updateCompletion = function (
	sessionsCompleted,
	totalSessions
) {
	this.sessionsCompleted = sessionsCompleted
	this.totalSessions = totalSessions
	this.completionPercentage =
		totalSessions > 0
			? Math.round((sessionsCompleted / totalSessions) * 100)
			: 0

	// Mark as completed if all sessions are done
	if (sessionsCompleted >= totalSessions && !this.isCompleted) {
		this.isCompleted = true
		this.completedAt = new Date()
	}

	return this.save()
}

// Static method to get or create course completion
CourseCompletionSchema.statics.getOrCreate = async function (
	userId,
	courseId,
	totalSessions = 0
) {
	let completion = await this.findOne({ userId, courseId })

	if (!completion) {
		completion = await this.create({
			userId,
			courseId,
			totalSessions,
		})
	} else if (totalSessions > 0 && completion.totalSessions !== totalSessions) {
		// Update total sessions if course structure changed
		completion.totalSessions = totalSessions
		await completion.save()
	}

	return completion
}

// Static method to recalculate completion for a course
CourseCompletionSchema.statics.recalculateCompletion = async function (
	userId,
	courseId
) {
	// Get all sessions for this course
	const sessions = await Session.find({ courseId }).select('_id').lean()
	const totalSessions = sessions.length

	if (totalSessions === 0) {
		return null
	}

	// Get completed sessions for this user (language-agnostic)
	const completedSessions = await SessionWatchProgress.countDocuments({
		userId,
		courseId,
		isCompleted: true,
	})

	// Get or create completion record
	const completion = await this.getOrCreate(userId, courseId, totalSessions)
	await completion.updateCompletion(completedSessions, totalSessions)

	return completion
}

const CourseCompletion = model('CourseCompletion', CourseCompletionSchema)

function validateCourseCompletion(req) {
	const schema = Joi.object({
		userId: Joi.objectId().required(),
		courseId: Joi.objectId().required(),
	})

	return schema.validate(req)
}

exports.CourseCompletion = CourseCompletion
exports.validateCourseCompletion = validateCourseCompletion
