const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)
const { Schema, model } = require('mongoose')

const MAX_QUIZ_ATTEMPTS = 2

const QuizAttemptSchema = new Schema(
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
		attemptNumber: {
			type: Number,
			required: true,
			min: 1,
			max: MAX_QUIZ_ATTEMPTS,
		},
		answers: [
			{
				questionId: {
					type: String,
					required: true,
				},
				selectedId: {
					type: String,
					required: true,
				},
				// Store if answer was correct (for analytics)
				isCorrect: {
					type: Boolean,
				},
			},
		],
		// Calculated score
		score: {
			type: Number,
			min: 0,
			max: 100,
		},
		// Number of correct answers
		correctAnswers: {
			type: Number,
			default: 0,
		},
		// Total questions
		totalQuestions: {
			type: Number,
			required: true,
		},
		// Whether this attempt passed
		isPassed: {
			type: Boolean,
			default: false,
		},
		// Whether this is the best attempt
		isBestAttempt: {
			type: Boolean,
			default: false,
		},
		completedAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
)

// Compound index - language-agnostic
QuizAttemptSchema.index({ userId: 1, sessionId: 1 })
QuizAttemptSchema.index({ userId: 1, courseId: 1 })

// Method to calculate score
QuizAttemptSchema.methods.calculateScore = function (correctAnswersMap) {
	let correct = 0
	this.answers.forEach((answer) => {
		const isCorrect = correctAnswersMap[answer.questionId] === answer.selectedId
		answer.isCorrect = isCorrect
		if (isCorrect) correct++
	})

	this.correctAnswers = correct
	this.totalQuestions = this.answers.length
	this.score =
		this.totalQuestions > 0
			? Math.round((correct / this.totalQuestions) * 100)
			: 0
	this.isPassed = this.score >= 70 // Or your passing criteria

	return this
}

// Static method to check if user can attempt quiz
QuizAttemptSchema.statics.canAttempt = async function (userId, sessionId) {
	const attempts = await this.find({ userId, sessionId })
		.sort({ attemptNumber: -1 })
		.limit(1)
		.lean()

	if (attempts.length === 0) {
		return { canAttempt: true, attemptNumber: 1 }
	}

	const lastAttempt = attempts[0]
	if (lastAttempt.attemptNumber < MAX_QUIZ_ATTEMPTS) {
		return {
			canAttempt: true,
			attemptNumber: lastAttempt.attemptNumber + 1,
			previousAttempts: attempts.length,
		}
	}

	return {
		canAttempt: false,
		attemptNumber: MAX_QUIZ_ATTEMPTS,
		message: `Maximum ${MAX_QUIZ_ATTEMPTS} attempts allowed`,
		previousAttempts: attempts.length,
	}
}

// Static method to get best attempt
QuizAttemptSchema.statics.getBestAttempt = async function (userId, sessionId) {
	return this.findOne({ userId, sessionId, isBestAttempt: true })
}

// Static method to create new attempt and update best attempt
QuizAttemptSchema.statics.createAttempt = async function (
	attemptData,
	correctAnswersMap
) {
	// Check if user can attempt
	const canAttempt = await this.canAttempt(
		attemptData.userId,
		attemptData.sessionId
	)

	if (!canAttempt.canAttempt) {
		throw new Error(canAttempt.message)
	}

	// Get existing attempts to determine attempt number
	const existingAttempts = await this.find({
		userId: attemptData.userId,
		sessionId: attemptData.sessionId,
	})

	attemptData.attemptNumber = existingAttempts.length + 1
	attemptData.totalQuestions = attemptData.answers.length

	const attempt = new this(attemptData)
	attempt.calculateScore(correctAnswersMap)

	// Check if this is the best attempt
	const bestAttempt = await this.getBestAttempt(
		attemptData.userId,
		attemptData.sessionId
	)

	if (!bestAttempt || attempt.score > bestAttempt.score) {
		// Remove best flag from previous best attempt
		if (bestAttempt) {
			bestAttempt.isBestAttempt = false
			await bestAttempt.save()
		}
		attempt.isBestAttempt = true
	}

	await attempt.save()
	return attempt
}

const QuizAttempt = model('QuizAttempt', QuizAttemptSchema)

function validateQuizAttempt(req) {
	const schema = Joi.object({
		userId: Joi.objectId().required(),
		sessionId: Joi.objectId().required(),
		courseId: Joi.objectId().required(),
		answers: Joi.array()
			.items(
				Joi.object({
					questionId: Joi.string().required(),
					selectedId: Joi.string().required(),
				})
			)
			.required(),
	})

	return schema.validate(req)
}

exports.QuizAttempt = QuizAttempt
exports.validateQuizAttempt = validateQuizAttempt
exports.MAX_QUIZ_ATTEMPTS = MAX_QUIZ_ATTEMPTS
