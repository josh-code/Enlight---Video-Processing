/**
 * Chat Cache Service
 * In-memory caching for conversation lists (no Redis needed)
 */

const conversationCache = new Map()
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

/**
 * Get cached conversations for a user
 * @param {string} userId - User ID
 * @returns {Array|null} Cached conversations or null if expired/missing
 */
function getCachedConversations(userId) {
	const cached = conversationCache.get(userId)
	if (!cached) return null

	const now = Date.now()
	if (now - cached.timestamp > CACHE_TTL) {
		conversationCache.delete(userId)
		return null
	}

	return cached.data
}

/**
 * Set cached conversations for a user
 * @param {string} userId - User ID
 * @param {Array} conversations - Conversations array
 */
function setCachedConversations(userId, conversations) {
	conversationCache.set(userId, {
		data: conversations,
		timestamp: Date.now(),
	})
}

/**
 * Invalidate cache for a user
 * @param {string} userId - User ID
 */
function invalidateCache(userId) {
	conversationCache.delete(userId)
}

/**
 * Invalidate cache for multiple users
 * @param {...string} userIds - User IDs
 */
function invalidateCacheForUsers(...userIds) {
	for (const userId of userIds) {
		conversationCache.delete(userId)
	}
}

/**
 * Clear all cache (useful for testing or maintenance)
 */
function clearAllCache() {
	conversationCache.clear()
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
	return {
		size: conversationCache.size,
		entries: Array.from(conversationCache.keys()),
	}
}

module.exports = {
	getCachedConversations,
	setCachedConversations,
	invalidateCache,
	invalidateCacheForUsers,
	clearAllCache,
	getCacheStats,
}
