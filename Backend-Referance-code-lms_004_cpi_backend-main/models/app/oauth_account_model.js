const mongoose = require('mongoose')
const { Schema } = mongoose

const OAuthAccountSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		provider: {
			type: String,
			enum: ['google', 'apple'],
			required: true,
		},
		providerId: {
			type: String,
			required: true,
		},
		email: {
			type: String,
			lowercase: true,
			trim: true,
		},
		accessToken: {
			type: String,
			select: false, // Don't include in queries by default for security
		},
		refreshToken: {
			type: String,
			select: false,
		},
		tokenExpiresAt: {
			type: Date,
		},
		profile: {
			name: String,
			firstName: String,
			lastName: String,
			image: String,
			locale: String,
		},
		linkedAt: {
			type: Date,
			default: Date.now,
		},
		lastUsedAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
)

// Compound unique index: one provider per user
OAuthAccountSchema.index({ userId: 1, provider: 1 }, { unique: true })

// Unique provider ID per provider
OAuthAccountSchema.index({ provider: 1, providerId: 1 }, { unique: true })

// Index for finding by email within a provider
OAuthAccountSchema.index({ provider: 1, email: 1 })

// Static method to find or create OAuth account
OAuthAccountSchema.statics.findOrCreateByProvider = async function ({
	provider,
	providerId,
	email,
	profile,
	userId,
}) {
	let oauthAccount = await this.findOne({ provider, providerId })

	if (oauthAccount) {
		// Update last used and profile if needed
		oauthAccount.lastUsedAt = new Date()
		if (profile) {
			oauthAccount.profile = { ...oauthAccount.profile, ...profile }
		}
		await oauthAccount.save()
		return { oauthAccount, isNew: false }
	}

	// Create new OAuth account
	oauthAccount = new this({
		userId,
		provider,
		providerId,
		email,
		profile,
		linkedAt: new Date(),
		lastUsedAt: new Date(),
	})
	await oauthAccount.save()

	return { oauthAccount, isNew: true }
}

// Static method to find OAuth account by provider and email
OAuthAccountSchema.statics.findByProviderEmail = function (provider, email) {
	return this.findOne({ provider, email: email.toLowerCase() })
}

// Instance method to update tokens
OAuthAccountSchema.methods.updateTokens = async function ({
	accessToken,
	refreshToken,
	expiresAt,
}) {
	this.accessToken = accessToken
	if (refreshToken) {
		this.refreshToken = refreshToken
	}
	if (expiresAt) {
		this.tokenExpiresAt = expiresAt
	}
	this.lastUsedAt = new Date()
	return this.save()
}

const OAuthAccount = mongoose.model('OAuthAccount', OAuthAccountSchema)

module.exports = {
	OAuthAccount,
	OAuthAccountSchema,
}
