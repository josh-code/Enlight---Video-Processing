/**
 * Socket Event Names
 *
 * Naming Convention:
 * - User-specific events: {category}:{action}:{userId} (e.g., "subscription:activated:userId123")
 * - Global events: {category}:{action} (e.g., "notification:new")
 * - Room events: {category}:{action}:{roomId} (e.g., "chat:message:room123")
 *
 * Categories:
 * - subscription: Subscription-related events
 * - payment: Payment-related events
 * - notification: Notification-related events
 * - chat: Chat-related events
 * - user: User status events (online/offline)
 */

const SOCKET_EVENTS = {
	// ==================== Subscription Events ====================
	SUBSCRIPTION: {
		ACTIVATED: (userId) => `subscription:activated:${userId}`,
		UPDATED: (userId) => `subscription:updated:${userId}`,
		CANCELED: (userId) => `subscription:canceled:${userId}`,
		INVOICE_PAID: (userId) => `subscription:invoice:paid:${userId}`,
		PAYMENT_FAILED: (userId) => `subscription:payment:failed:${userId}`,
	},

	// ==================== Payment Events ====================
	PAYMENT: {
		SUCCESS: (userId) => `payment:success:${userId}`,
		FAILED: (userId) => `payment:failed:${userId}`,
		REFUNDED: (userId) => `payment:refunded:${userId}`,
		// Generic update event (for guest purchases)
		UPDATE: 'payment:update',
	},

	// ==================== Notification Events ====================
	NOTIFICATION: {
		NEW: (userId) => `notification:new:${userId}`,
		READ: (userId) => `notification:read:${userId}`,
		COUNT: (userId) => `notification:count:${userId}`,
	},

	// ==================== Conversation Events ====================
	CONVERSATION: {
		CREATED: (userId) => `conversation:created:${userId}`,
		UPDATED: (userId) => `conversation:updated:${userId}`,
		LIST: (userId) => `conversation:list:${userId}`,
		BLOCKED: (conversationId) => `conversation:blocked:${conversationId}`,
		UNBLOCKED: (conversationId) => `conversation:unblocked:${conversationId}`,
		DELETED: (conversationId) => `conversation:deleted:${conversationId}`,
	},

	// ==================== Message Events ====================
	MESSAGE: {
		SENT: (conversationId) => `message:sent:${conversationId}`,
		DELETED: (conversationId) => `message:deleted:${conversationId}`,
		READ: (conversationId) => `message:read:${conversationId}`,
		DELIVERED: (conversationId) => `message:delivered:${conversationId}`,
		HISTORY: 'message:history',
		HISTORY_ERROR: 'message:history:error',
	},

	// ==================== User Status Events ====================
	USER: {
		ONLINE: 'user:online',
		OFFLINE: 'user:offline',
		ONLINE_USERS: 'user:online:list',
		INFO: (userId) => `user:info:${userId}`,
		ADMIN_BLOCKED: (userId) => `user:admin_blocked:${userId}`,
		ADMIN_UNBLOCKED: (userId) => `user:admin_unblocked:${userId}`,
		TYPING: (conversationId) => `user:typing:${conversationId}`,
		STOP_TYPING: (conversationId) => `user:stop_typing:${conversationId}`,
	},
}

/**
 * Socket Event Listeners (what client sends to server)
 */
const SOCKET_LISTENERS = {
	// Chat (Legacy - Deprecated)
	CHAT: {
		REGISTER: 'chat:register',
		JOIN_ROOM: 'chat:join:room',
		SEND_MESSAGE: 'chat:send:message',
		TYPING: 'chat:typing',
		STOP_TYPING: 'chat:stop:typing',
		ACCEPT_CONVERSATION: 'chat:accept:conversation',
		BLOCK_CONVERSATION: 'chat:block:conversation',
		UNBLOCK_CONVERSATION: 'chat:unblock:conversation',
		MARK_READ: 'chat:mark:read',
		GET_USER_INFO: 'chat:get:user:info',
		REPORT_USER: 'chat:report:user',
		BLOCK_USER: 'chat:block:user',
		UNBLOCK_USER: 'chat:unblock:user',
	},

	// Conversation (New)
	CONVERSATION: {
		CREATE: 'conversation:create',
		ACCEPT: 'conversation:accept',
		BLOCK: 'conversation:block',
		UNBLOCK: 'conversation:unblock',
		DELETE: 'conversation:delete',
		GET_LIST: 'conversation:get_list',
	},

	// Message
	MESSAGE: {
		SEND: 'message:send',
		DELETE: 'message:delete',
		MARK_READ: 'message:mark_read',
		GET_HISTORY: 'message:get_history',
	},

	// User
	USER: {
		GET_INFO: 'user:get_info',
		REPORT: 'user:report',
		BLOCK: 'user:block',
		UNBLOCK: 'user:unblock',
		TYPING: 'user:typing',
		STOP_TYPING: 'user:stop_typing',
	},
}

module.exports = {
	SOCKET_EVENTS,
	SOCKET_LISTENERS,
}
