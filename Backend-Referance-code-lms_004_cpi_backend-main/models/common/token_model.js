const mongoose = require('mongoose')
const { Schema } = require('mongoose')

const TokenSchema = new Schema(
	{
		token: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		type: {
			type: String,
			required: true,
			enum: [
				'signup_completion', // For mobile signup to web checkout flow
				'password_reset', // For password reset functionality
				'email_verification', // For email verification
				'email-verification', // For profile email verification
				'phone-verification', // For profile phone verification
				'course_invitation', // For course invitations
				'admin_invitation', // For admin invitations
				'temporary_access', // For temporary access grants
				'custom', // For any custom use case
			],
			index: true,
		},
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: function () {
				// userId is required for most token types except some custom ones
				return !['custom'].includes(this.type)
			},
		},
		metadata: {
			type: Schema.Types.Mixed,
			default: {},
			// Store additional data like courseId, redirectUrl, etc.
			// For signup_completion: { courseId: "123", redirectUrl: "/checkout" }
			// For password_reset: { email: "user@example.com" }
			// For custom: any custom data
		},
		expiresAt: {
			type: Date,
			required: true,
			index: true,
		},
		isUsed: {
			type: Boolean,
			default: false,
			index: true,
		},
		usedAt: {
			type: Date,
			default: null,
		},
		usedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		clientInfo: {
			ipAddress: String,
			userAgent: String,
			deviceType: String, // "mobile", "web", "tablet"
		},
	},
	{
		timestamps: true,
	}
)

// Compound indexes for efficient queries
TokenSchema.index({ type: 1, userId: 1 })
TokenSchema.index({ type: 1, isUsed: 1 })
TokenSchema.index({ type: 1, expiresAt: 1 })
TokenSchema.index({ token: 1, type: 1, isUsed: 1 })

// Instance method to mark token as used
TokenSchema.methods.markAsUsed = function (userId = null) {
	this.isUsed = true
	this.usedAt = new Date()
	if (userId) {
		this.usedBy = userId
	}
	return this.save()
}

// Instance method to check if token is valid
TokenSchema.methods.isValid = function () {
	return !this.isUsed && new Date() < this.expiresAt
}

// Static method to create a signup completion token
TokenSchema.statics.createSignupToken = function (
	userId,
	courseId,
	expiresInHours = 24
) {
	const crypto = require('crypto')
	const token = crypto.randomBytes(32).toString('hex')

	return this.create({
		token,
		type: 'signup_completion',
		userId,
		metadata: {
			courseId,
			redirectUrl: '/checkout',
		},
		expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
	})
}

// Static method to create a password reset token
TokenSchema.statics.createPasswordResetToken = function (
	userId,
	expiresInHours = 1
) {
	const crypto = require('crypto')
	const token = crypto.randomBytes(32).toString('hex')

	return this.create({
		token,
		type: 'password_reset',
		userId,
		expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
	})
}

// Static method to create an email verification token
TokenSchema.statics.createEmailVerificationToken = function (
	userId,
	expiresInHours = 24
) {
	const crypto = require('crypto')
	const token = crypto.randomBytes(32).toString('hex')

	return this.create({
		token,
		type: 'email_verification',
		userId,
		expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
	})
}

// Static method to find and validate a token
TokenSchema.statics.findAndValidate = function (token, type) {
	return this.findOne({
		token,
		type,
		expiresAt: { $gt: new Date() },
	})
}

// Static method to clean up expired tokens (for cron job)
TokenSchema.statics.cleanupExpiredTokens = function () {
	return this.deleteMany({
		expiresAt: { $lt: new Date() },
	})
}

// Static method to get token statistics
TokenSchema.statics.getTokenStats = function () {
	return this.aggregate([
		{
			$group: {
				_id: {
					type: '$type',
					isUsed: '$isUsed',
				},
				count: { $sum: 1 },
			},
		},
		{
			$group: {
				_id: '$_id.type',
				stats: {
					$push: {
						isUsed: '$_id.isUsed',
						count: '$count',
					},
				},
				total: { $sum: '$count' },
			},
		},
	])
}

const Token = mongoose.model('Token', TokenSchema)

module.exports = Token
