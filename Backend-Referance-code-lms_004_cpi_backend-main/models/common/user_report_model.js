const mongoose = require('mongoose')

const userReportSchema = new mongoose.Schema(
	{
		reporter: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		reportedUser: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		reason: {
			type: String,
			required: true,
			enum: [
				'inappropriate_content',
				'harassment',
				'spam',
				'fake_profile',
				'other',
			],
		},
		comment: {
			type: String,
			maxlength: 1000,
			default: '',
		},
		status: {
			type: String,
			enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
			default: 'pending',
		},
		adminNotes: {
			type: String,
			maxlength: 1000,
			default: '',
		},
		reviewedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		reviewedAt: {
			type: Date,
			default: null,
		},
		resolvedAt: {
			type: Date,
			default: null,
		},
		// Chat blocking fields
		chatBlockStatus: {
			type: String,
			enum: ['none', 'blocked'],
			default: 'none',
		},
		chatBlockedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		chatBlockedAt: {
			type: Date,
			default: null,
		},
		chatBlockReason: {
			type: String,
			maxlength: 500,
			default: '',
		},
		// Store last 5 messages for context
		contextMessages: [
			{
				sender: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'User',
				},
				message: String,
				createdAt: Date,
			},
		],
	},
	{ timestamps: true }
)

// Ensure a user cannot report themselves
userReportSchema.pre('save', function (next) {
	if (this.reporter.toString() === this.reportedUser.toString()) {
		const error = new Error('Users cannot report themselves')
		return next(error)
	}
	next()
})

// Index for efficient querying
userReportSchema.index({ status: 1, createdAt: -1 })
userReportSchema.index({ reportedUser: 1, status: 1 })
userReportSchema.index({ reporter: 1, reportedUser: 1 })

const UserReport = mongoose.model('UserReport', userReportSchema)

module.exports = UserReport
