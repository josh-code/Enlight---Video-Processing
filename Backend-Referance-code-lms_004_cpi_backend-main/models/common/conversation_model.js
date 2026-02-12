const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema(
	{
		// Participants (2 for direct, 2+ for group)
		participants: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User',
				required: true,
			},
		],

		// Conversation type (extensible for groups)
		type: {
			type: String,
			enum: ['direct', 'group'],
			default: 'direct',
		},

		// Pre-computed metadata (avoids aggregation)
		lastMessage: {
			messageId: {
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Message',
				default: null,
			},
			content: String,
			senderId: {
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User',
				default: null,
			},
			sentAt: Date,
		},

		// Per-user unread counts: Map<userId, count>
		unreadCounts: {
			type: Map,
			of: Number,
			default: {},
		},

		// Conversation status
		status: {
			type: String,
			enum: ['pending', 'active', 'blocked'],
			default: 'pending',
		},

		// Blocking info
		blockedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},
		blockedAt: {
			type: Date,
			default: null,
		},

		// Soft delete tracking (per user)
		deletedFor: [
			{
				userId: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'User',
				},
				deletedAt: Date,
			},
		],

		// Group-specific fields (future-ready)
		groupInfo: {
			name: String,
			avatar: String,
			createdBy: {
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User',
			},
			admins: [
				{
					type: mongoose.Schema.Types.ObjectId,
					ref: 'User',
				},
			],
		},
	},
	{ timestamps: true }
)

// Indexes for efficient queries
conversationSchema.index({ participants: 1 })
conversationSchema.index({ 'lastMessage.sentAt': -1 })
conversationSchema.index({ status: 1, 'lastMessage.sentAt': -1 })

// Ensure unique direct conversation between two users
conversationSchema.index(
	{ participants: 1, type: 1 },
	{
		unique: true,
		partialFilterExpression: { type: 'direct' },
		sparse: true,
	}
)

const Conversation = mongoose.model('Conversation', conversationSchema)

module.exports = Conversation
