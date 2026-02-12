const mongoose = require('mongoose')
const Joi = require('joi')
const jwt = require('jsonwebtoken')
const config = require('config')
const { parsePhoneNumberWithError } = require('libphonenumber-js')

const userSchema = mongoose.Schema(
	{
		name: {
			type: String,
			required: function () {
				return this.accountCompleted !== false
			},
			minlength: 1,
			maxlength: 100,
			trim: true,
		},
		email: {
			type: String,
			validate: {
				validator: function (v) {
					return !!v || !!this.phone
				},
				message: 'Either email or phone must be provided.',
			},
			lowercase: true,
			trim: true,
		},
		phone: {
			type: String,
			validate: {
				validator: function (v) {
					if (!v) return !!this.email
					// National number: 7-15 digits only (no country code)
					return /^\d{7,15}$/.test(v)
				},
				message:
					'Phone must be 7-15 digits (national number without country code) or email must be provided.',
			},
			trim: true,
		},
		phonePin: {
			type: String,
			validate: {
				validator: function (v) {
					// phonePin is required if phone is provided
					if (!this.phone) return true // Optional if no phone
					if (!v) return false // Required if phone is set
					// Country dial code: + followed by 1-4 digits
					return /^\+\d{1,4}$/.test(v)
				},
				message:
					'phonePin (country dial code) is required when phone is provided and must be in format +1 to +9999.',
			},
			trim: true,
		},
		image: String,
		password: {
			type: String,
			// Password is optional at model level - validated in routes
			// Required for password-based signup, not required for OAuth users
			required: false,
			minlength: 8,
			maxlength: 1024,
		},
		// Verification fields (Date = when verified, null = not verified)
		emailVerifiedAt: {
			type: Date,
			default: null,
		},
		phoneVerifiedAt: {
			type: Date,
			default: null,
		},
		isEnabled: {
			type: Boolean,
			default: false,
		},
		timeZone: String,
		isSuperAdmin: {
			type: Boolean,
			default: false,
		},
		isAdmin: {
			type: Boolean,
			default: false,
		},
		isDev: {
			type: Boolean,
			default: false,
		},
		preferredDownloadQuality: {
			type: String,
			enum: ['360p', '480p', '720p', '1080p'],
			default: '720p',
		},
		preferredAppLanguage: {
			type: String,
			default: 'en',
		},
		stripeCustomerId: {
			type: String,
		},
		isDeleted: {
			type: Boolean,
			default: false,
		},
		deletedAt: {
			type: Date,
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
)

// Indexes
userSchema.index({ email: 1, phone: 1 }, { unique: true })
userSchema.index({ email: 1 }, { sparse: true })
userSchema.index({ phone: 1 }, { sparse: true })

// Virtual: isVerified (true if either email or phone is verified)
userSchema.virtual('isVerified').get(function () {
	return !!(this.emailVerifiedAt || this.phoneVerifiedAt)
})

// Virtual: verificationStatus (detailed verification info)
userSchema.virtual('verificationStatus').get(function () {
	return {
		isVerified: !!(this.emailVerifiedAt || this.phoneVerifiedAt),
		emailVerifiedAt: this.emailVerifiedAt || null,
		phoneVerifiedAt: this.phoneVerifiedAt || null,
		needsVerification: !(this.emailVerifiedAt || this.phoneVerifiedAt),
	}
})

// Virtual: oauthAccounts (populate from OAuthAccount model)
userSchema.virtual('oauthAccounts', {
	ref: 'OAuthAccount',
	localField: '_id',
	foreignField: 'userId',
})

// Virtual: sessions (populate from AuthSession model)
userSchema.virtual('activeSessions', {
	ref: 'AuthSession',
	localField: '_id',
	foreignField: 'userId',
	match: { isActive: true },
})

// Instance method to generate auth token
userSchema.methods.generateAuthToken = function () {
	const token = jwt.sign({ _id: this._id }, config.get('jwtPrivateKey'))
	return token
}

// Instance method to verify email
userSchema.methods.verifyEmail = async function () {
	this.emailVerifiedAt = new Date()
	this.isEnabled = true
	return this.save()
}

// Instance method to verify phone
userSchema.methods.verifyPhone = async function () {
	this.phoneVerifiedAt = new Date()
	this.isEnabled = true
	return this.save()
}

// Instance method to check if user has OAuth account
userSchema.methods.hasOAuthProvider = async function (provider) {
	const OAuthAccount = mongoose.model('OAuthAccount')
	const account = await OAuthAccount.findOne({
		userId: this._id,
		provider,
	})
	return !!account
}

// Instance method to get safe user data (without sensitive fields)
userSchema.methods.toSafeObject = function () {
	const obj = this.toObject()
	delete obj.password
	delete obj.__v
	return obj
}

// Static method to find by email or phone
// Supports: email, phone only (national number), or phone with country code
userSchema.statics.findByEmailOrPhone = function (emailOrPhone) {
	const isEmail = /\S+@\S+\.\S+/.test(emailOrPhone)

	if (isEmail) {
		return this.findOne({
			email: emailOrPhone.toLowerCase(),
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})
	}

	// Check if input starts with + (E.164-like format with country code)
	if (emailOrPhone.startsWith('+')) {
		// Parse E.164 format to extract phonePin and phone
		// Use libphonenumber-js for accurate parsing

		try {
			const parsed = parsePhoneNumberWithError(emailOrPhone)
			if (parsed && parsed.isValid()) {
				const phonePin = `+${parsed.countryCallingCode}`
				const phone = parsed.nationalNumber
				return this.findOne({
					phone,
					phonePin,
					$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
				})
			}
		} catch (e) {
			// Invalid phone format, fall through to direct search
		}
	}

	// Just digits - search by phone field only (national number)
	const cleanPhone = emailOrPhone.replace(/\D/g, '')
	if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
		return this.findOne({
			phone: cleanPhone,
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})
	}

	// No valid match criteria
	return Promise.resolve(null)
}

const User = mongoose.model('User', userSchema)

// Validation for user signup (password-based)
function validateSignup(req) {
	const schema = Joi.object({
		name: Joi.string().required().max(100).min(1).trim(),
		email: Joi.string().email().optional().allow(''),
		phone: Joi.string()
			.pattern(/^\d{7,15}$/)
			.optional()
			.allow('')
			.messages({
				'string.pattern.base':
					'Phone must be 7-15 digits (national number without country code)',
			}),
		phonePin: Joi.string()
			.pattern(/^\+\d{1,4}$/)
			.optional()
			.allow('')
			.messages({
				'string.pattern.base':
					'phonePin must be a country dial code (e.g., +1, +91)',
			}),
		password: Joi.string().min(8).max(1024).required(),
		image: Joi.string().optional().allow(''),
		timeZone: Joi.string().optional(),
		preferredAppLanguage: Joi.string().optional(),
	})
		.or('email', 'phone')
		.with('phone', 'phonePin') // If phone is provided, phonePin is required

	return schema.validate(req)
}

// Validation for OAuth signup (no password required)
function validateOAuthSignup(req) {
	const schema = Joi.object({
		name: Joi.string().required().max(100).min(1).trim(),
		email: Joi.string().email().optional().allow(''),
		phone: Joi.string()
			.pattern(/^\d{7,15}$/)
			.optional()
			.allow('')
			.messages({
				'string.pattern.base':
					'Phone must be 7-15 digits (national number without country code)',
			}),
		phonePin: Joi.string()
			.pattern(/^\+\d{1,4}$/)
			.optional()
			.allow('')
			.messages({
				'string.pattern.base':
					'phonePin must be a country dial code (e.g., +1, +91)',
			}),
		image: Joi.string().optional().allow(''),
		timeZone: Joi.string().optional(),
		preferredAppLanguage: Joi.string().optional(),
	})
		.or('email', 'phone')
		.with('phone', 'phonePin') // If phone is provided, phonePin is required

	return schema.validate(req)
}

// Original validate function for backward compatibility
function validate(req) {
	const schema = Joi.object({
		name: Joi.string().required().max(100).min(1).trim(),
		email: Joi.string().email().optional().allow(''),
		phone: Joi.string()
			.pattern(/^\d{7,15}$/)
			.optional()
			.allow('')
			.messages({
				'string.pattern.base':
					'Phone must be 7-15 digits (national number without country code)',
			}),
		phonePin: Joi.string()
			.pattern(/^\+\d{1,4}$/)
			.optional()
			.allow('')
			.messages({
				'string.pattern.base':
					'phonePin must be a country dial code (e.g., +1, +91)',
			}),
		image: Joi.string().optional().allow(''),
		password: Joi.string().max(1024).optional().allow(''),
		isEnabled: Joi.boolean(),
		isSuperAdmin: Joi.boolean(),
		isAdmin: Joi.boolean(),
		isDev: Joi.boolean(),
		timeZone: Joi.string().optional(),
		preferredDownloadQuality: Joi.string().optional(),
		preferredAppLanguage: Joi.string().optional(),
	})
		.or('email', 'phone')
		.with('phone', 'phonePin') // If phone is provided, phonePin is required
	return schema.validate(req)
}

exports.User = User
exports.userSchema = userSchema
exports.validateUser = validate
exports.validateSignup = validateSignup
exports.validateOAuthSignup = validateOAuthSignup
