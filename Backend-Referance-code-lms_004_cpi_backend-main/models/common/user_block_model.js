const mongoose = require('mongoose')

const userBlockSchema = new mongoose.Schema(
	{
		blocker: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		blockedUser: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		blockedAt: {
			type: Date,
			default: Date.now,
		},
		unblockedAt: {
			type: Date,
			default: null,
		},
		unblockedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		// Block type (user-initiated or admin-initiated)
		blockType: {
			type: String,
			enum: ['user', 'admin'],
			default: 'user',
		},
		// Block reason
		blockReason: {
			type: String,
			maxlength: 500,
			default: '',
		},
		// Admin who blocked (if blockType is 'admin')
		blockedByAdmin: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
	},
	{ timestamps: true }
)

// Ensure unique combination of blocker and blockedUser
userBlockSchema.index({ blocker: 1, blockedUser: 1 }, { unique: true })

// Ensure a user cannot block themselves
userBlockSchema.pre('save', function (next) {
	if (this.blocker.toString() === this.blockedUser.toString()) {
		const error = new Error('Users cannot block themselves')
		return next(error)
	}
	next()
})

const UserBlock = mongoose.model('UserBlock', userBlockSchema)

module.exports = UserBlock
