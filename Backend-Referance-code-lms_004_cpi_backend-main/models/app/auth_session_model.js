const mongoose = require('mongoose')
const { Schema } = mongoose

const AuthSessionSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		deviceId: {
			type: String,
			required: true,
		},
		token: {
			type: String,
			required: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		// Device Info
		deviceType: {
			type: String,
			enum: ['web', 'mobile', 'tablet', 'desktop'],
			default: 'web',
		},
		deviceName: {
			type: String,
		},
		// Platform Details
		platform: {
			os: {
				name: String,
				version: String,
			},
			browser: {
				name: String,
				version: String,
			},
			app: {
				name: String,
				version: String,
				buildNumber: String,
			},
		},
		// Timestamps
		loginAt: {
			type: Date,
			default: Date.now,
		},
		lastActiveAt: {
			type: Date,
			default: Date.now,
		},
		logoutAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
)

// Compound index for session lookup
AuthSessionSchema.index({ userId: 1, deviceId: 1 })
AuthSessionSchema.index({ userId: 1, isActive: 1 })
AuthSessionSchema.index({ token: 1 })

// Index for cleanup of old inactive sessions
AuthSessionSchema.index({ isActive: 1, logoutAt: 1 })

// Static method to create or update session
AuthSessionSchema.statics.upsertSession = async function ({
	userId,
	deviceId,
	token,
	deviceType,
	deviceName,
	platform,
}) {
	const session = await this.findOneAndUpdate(
		{ userId, deviceId },
		{
			token,
			isActive: true,
			deviceType,
			deviceName,
			platform,
			loginAt: new Date(),
			lastActiveAt: new Date(),
			logoutAt: null,
		},
		{ upsert: true, new: true }
	)

	return session
}

// Static method to get active sessions for a user
AuthSessionSchema.statics.getActiveSessions = function (userId) {
	return this.find({ userId, isActive: true }).sort({ lastActiveAt: -1 })
}

// Static method to invalidate session by deviceId
AuthSessionSchema.statics.invalidateByDeviceId = function (userId, deviceId) {
	return this.findOneAndUpdate(
		{ userId, deviceId },
		{ isActive: false, logoutAt: new Date() },
		{ new: true }
	)
}

// Static method to invalidate session by token
AuthSessionSchema.statics.invalidateByToken = function (token) {
	return this.findOneAndUpdate(
		{ token },
		{ isActive: false, logoutAt: new Date() },
		{ new: true }
	)
}

// Static method to invalidate all sessions except current
AuthSessionSchema.statics.invalidateAllExcept = function (
	userId,
	exceptDeviceId
) {
	return this.updateMany(
		{ userId, deviceId: { $ne: exceptDeviceId }, isActive: true },
		{ isActive: false, logoutAt: new Date() }
	)
}

// Static method to invalidate all sessions for a user
AuthSessionSchema.statics.invalidateAll = function (userId) {
	return this.updateMany(
		{ userId, isActive: true },
		{ isActive: false, logoutAt: new Date() }
	)
}

// Static method to update last active timestamp
AuthSessionSchema.statics.updateLastActive = function (sessionId) {
	return this.findByIdAndUpdate(
		sessionId,
		{ lastActiveAt: new Date() },
		{ new: true }
	)
}

// Static method to enforce max sessions limit
AuthSessionSchema.statics.enforceMaxSessions = async function (
	userId,
	maxSessions
) {
	const activeSessions = await this.find({ userId, isActive: true })
		.sort({ loginAt: -1 })
		.lean()

	if (activeSessions.length > maxSessions) {
		// Get sessions to invalidate (oldest first, keep newest maxSessions)
		const sessionsToInvalidate = activeSessions.slice(maxSessions)
		const idsToInvalidate = sessionsToInvalidate.map((s) => s._id)

		await this.updateMany(
			{ _id: { $in: idsToInvalidate } },
			{ isActive: false, logoutAt: new Date() }
		)

		return sessionsToInvalidate.length
	}

	return 0
}

// Static method to validate session
AuthSessionSchema.statics.validateSession = async function ({
	userId,
	deviceId,
	token,
}) {
	const session = await this.findOne({
		userId,
		deviceId,
		token,
		isActive: true,
	})

	if (!session) {
		return null
	}

	// Update last active in background (don't wait)
	this.updateLastActive(session._id).catch((err) => {
		console.error('Error updating lastActiveAt:', err)
	})

	return session
}

// Instance method to logout
AuthSessionSchema.methods.logout = async function () {
	this.isActive = false
	this.logoutAt = new Date()
	return this.save()
}

const AuthSession = mongoose.model('AuthSession', AuthSessionSchema)

module.exports = {
	AuthSession,
	AuthSessionSchema,
}
