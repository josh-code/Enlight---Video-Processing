const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)
const { Schema, model } = require('mongoose')

const SessionWatchProgressSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		sessionId: {
			type: Schema.Types.ObjectId,
			ref: 'Session',
			required: true,
			index: true,
		},
		courseId: {
			type: Schema.Types.ObjectId,
			ref: 'Course',
			required: true,
			index: true,
		},
		// Current watch position in seconds
		currentTime: {
			type: Number,
			default: 0,
			min: 0,
		},
		// Total duration watched (for analytics)
		totalWatchedTime: {
			type: Number,
			default: 0,
			min: 0,
		},
		// Whether the session is fully watched
		isCompleted: {
			type: Boolean,
			default: false,
			index: true,
		},
		// When the session was first started
		startedAt: {
			type: Date,
			default: Date.now,
		},
		// When the session was completed (if completed)
		completedAt: {
			type: Date,
		},
		// Last time user watched this session (any language)
		lastWatchedAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
)

// Compound unique index - one progress per user per session (language-agnostic)
SessionWatchProgressSchema.index({ userId: 1, sessionId: 1 }, { unique: true })
SessionWatchProgressSchema.index({ userId: 1, courseId: 1 })
SessionWatchProgressSchema.index({ userId: 1, courseId: 1, isCompleted: 1 })

// Method to update watch progress
SessionWatchProgressSchema.methods.updateProgress = function (
	currentTime,
	totalDuration
) {
	this.currentTime = Math.min(currentTime, totalDuration)
	this.totalWatchedTime = Math.max(this.totalWatchedTime, currentTime)
	this.lastWatchedAt = new Date()

	// Mark as completed if watched >= 90% of video
	const completionThreshold = totalDuration * 0.9
	if (this.currentTime >= completionThreshold && !this.isCompleted) {
		this.isCompleted = true
		this.completedAt = new Date()
	}

	return this.save()
}

// Static method to get or create watch progress
SessionWatchProgressSchema.statics.getOrCreate = async function (
	userId,
	sessionId,
	courseId
) {
	let progress = await this.findOne({ userId, sessionId })

	if (!progress) {
		progress = await this.create({
			userId,
			sessionId,
			courseId,
		})
	}

	return progress
}

const SessionWatchProgress = model(
	'SessionWatchProgress',
	SessionWatchProgressSchema
)

function validateSessionWatchProgress(req) {
	const schema = Joi.object({
		userId: Joi.objectId().required(),
		sessionId: Joi.objectId().required(),
		courseId: Joi.objectId().required(),
		currentTime: Joi.number().min(0).optional(),
		totalWatchedTime: Joi.number().min(0).optional(),
	})

	return schema.validate(req)
}

exports.SessionWatchProgress = SessionWatchProgress
exports.validateSessionWatchProgress = validateSessionWatchProgress
