const { emitToUser, emitToRoom, SOCKET_EVENTS } = require('../socket')

/**
 * Socket Emitter Service
 * Pure event emission - no business logic
 */

/**
 * Emit conversation created event
 * @param {Object} conversation - Conversation object
 * @param {Array<string>} userIds - User IDs to notify
 */
function emitConversationCreated(conversation, userIds) {
	for (const userId of userIds) {
		emitToUser(userId, SOCKET_EVENTS.CONVERSATION.CREATED(userId), conversation)
	}
}

/**
 * Emit message sent event
 * @param {Object} message - Message object
 * @param {string} conversationId - Conversation ID
 */
function emitMessageSent(message, conversationId) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.MESSAGE.SENT(conversationId),
		message
	)
}

/**
 * Emit message deleted event
 * @param {string} messageId - Message ID
 * @param {string} conversationId - Conversation ID
 */
function emitMessageDeleted(messageId, conversationId) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.MESSAGE.DELETED(conversationId),
		{ messageId }
	)
}

/**
 * Emit conversation blocked event
 * @param {string} conversationId - Conversation ID
 * @param {string} blockedBy - User ID who blocked
 */
function emitConversationBlocked(conversationId, blockedBy) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.CONVERSATION.BLOCKED(conversationId),
		{ conversationId, blockedBy }
	)
}

/**
 * Emit conversation unblocked event
 * @param {string} conversationId - Conversation ID
 */
function emitConversationUnblocked(conversationId) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.CONVERSATION.UNBLOCKED(conversationId),
		{ conversationId }
	)
}

/**
 * Emit user admin blocked event
 * @param {string} userId - User ID who was blocked
 */
function emitUserAdminBlocked(userId) {
	emitToUser(userId, SOCKET_EVENTS.USER.ADMIN_BLOCKED(userId), {
		userId,
		blockedAt: new Date(),
	})
}

/**
 * Emit user admin unblocked event
 * @param {string} userId - User ID who was unblocked
 */
function emitUserAdminUnblocked(userId) {
	emitToUser(userId, SOCKET_EVENTS.USER.ADMIN_UNBLOCKED(userId), {
		userId,
		unblockedAt: new Date(),
	})
}

/**
 * Emit conversation list update
 * @param {string} userId - User ID
 * @param {Array} conversations - Conversations array
 */
function emitConversationListUpdate(userId, conversations) {
	emitToUser(userId, SOCKET_EVENTS.CONVERSATION.LIST(userId), conversations)
}

/**
 * Emit conversation updated event
 * @param {string} userId - User ID
 * @param {Object} conversation - Updated conversation
 */
function emitConversationUpdated(userId, conversation) {
	emitToUser(userId, SOCKET_EVENTS.CONVERSATION.UPDATED(userId), conversation)
}

/**
 * Emit typing indicator
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID who is typing
 */
function emitTyping(conversationId, userId) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.USER.TYPING(conversationId),
		{ userId, conversationId }
	)
}

/**
 * Emit stop typing indicator
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID who stopped typing
 */
function emitStopTyping(conversationId, userId) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.USER.STOP_TYPING(conversationId),
		{ userId, conversationId }
	)
}

/**
 * Emit message read event
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID who read
 * @param {Array<string>} messageIds - Message IDs that were read
 */
function emitMessageRead(conversationId, userId, messageIds) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.MESSAGE.READ(conversationId),
		{ userId, messageIds, conversationId }
	)
}

/**
 * Emit message delivered event
 * @param {string} conversationId - Conversation ID
 * @param {string} userId - User ID who received
 * @param {Array<string>} messageIds - Message IDs that were delivered
 */
function emitMessageDelivered(conversationId, userId, messageIds) {
	emitToRoom(
		`conversation_${conversationId}`,
		SOCKET_EVENTS.MESSAGE.DELIVERED(conversationId),
		{ userId, messageIds, conversationId }
	)
}

module.exports = {
	emitConversationCreated,
	emitMessageSent,
	emitMessageDeleted,
	emitConversationBlocked,
	emitConversationUnblocked,
	emitUserAdminBlocked,
	emitUserAdminUnblocked,
	emitConversationListUpdate,
	emitConversationUpdated,
	emitTyping,
	emitStopTyping,
	emitMessageRead,
	emitMessageDelivered,
}
