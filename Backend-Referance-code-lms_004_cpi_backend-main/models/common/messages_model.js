const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
	{
		// Link to conversation
		conversation: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Conversation',
			required: false, // Optional during migration, will be required after migration
			index: true,
		},

		sender: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},

		// Receiver field (for migration compatibility)
		receiver: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: false,
		},

		// Message content (legacy field name, use content instead)
		message: String,

		// Message content
		content: String,

		// Message type (extensible)
		type: {
			type: String,
			enum: ['text', 'system', 'image', 'video', 'file'],
			default: 'text',
		},

		// Media support (future-ready)
		media: {
			url: String,
			type: String,
			fileName: String,
			fileSize: Number,
			thumbnailUrl: String,
		},

		// System message metadata
		systemAction: {
			type: String,
			enum: [
				'user_blocked',
				'user_unblocked',
				'admin_blocked',
				'admin_unblocked',
				'conversation_accepted',
			],
			default: null,
		},

		// Read/Delivery tracking
		readBy: [
			{
				userId: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'User',
				},
				readAt: Date,
			},
		],

		deliveredTo: [
			{
				userId: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'User',
				},
				deliveredAt: Date,
			},
		],

		// Is read (legacy field, use readBy array instead)
		isRead: {
			type: Boolean,
			default: false,
		},

		// Conversation status (legacy field, use conversation.status instead)
		conversationStatus: {
			type: String,
			enum: ['pending', 'accepted', 'blocked'],
			default: 'pending',
		},

		blockedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},

		// Reference to UserBlock if this conversation was blocked
		userBlockId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'UserBlock',
			default: null,
		},

		// Soft delete
		isDeleted: {
			type: Boolean,
			default: false,
		},
		deletedAt: {
			type: Date,
			default: null,
		},
		deletedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			default: null,
		},

		// Reply support (future)
		replyTo: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Message',
			default: null,
		},
	},
	{ timestamps: true }
)

// Indexes for efficient queries
messageSchema.index({ conversation: 1, createdAt: -1 })
messageSchema.index({ sender: 1, createdAt: -1 })
messageSchema.index({ conversation: 1, isDeleted: 1, createdAt: -1 })
messageSchema.index({ receiver: 1, createdAt: -1 }) // Legacy index

// Virtual to get content from either message or content field
messageSchema.virtual('messageContent').get(function () {
	return this.content || this.message || ''
})

const Message = mongoose.model('Message', messageSchema)

module.exports = Message
