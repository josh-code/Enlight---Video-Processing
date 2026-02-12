const { emitToUser, SOCKET_EVENTS } = require('../index')
const {
	Notification,
} = require('../../../models/app/communication/notification_model')

/**
 * Emit new notification event
 * Should be called after creating a notification in the database
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>} Success status
 */
async function emitNewNotification(userId, notificationId) {
	try {
		const notification = await Notification.findById(notificationId).lean()
		if (!notification) {
			console.warn(`⚠️ Notification ${notificationId} not found`)
			return false
		}

		const success = emitToUser(userId, SOCKET_EVENTS.NOTIFICATION.NEW(userId), {
			notificationId: notification._id,
			title: notification.title,
			message: notification.message,
			createdDate: notification.createdDate,
			read: notification.read,
		})

		// Also emit count update
		await emitNotificationCount(userId)

		return success
	} catch (error) {
		console.error('Error emitting new notification:', error)
		return false
	}
}

/**
 * Emit notification count update
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} Success status
 */
async function emitNotificationCount(userId) {
	try {
		const unreadCount = await Notification.countDocuments({
			recipients: userId,
			read: false,
		})

		return emitToUser(userId, SOCKET_EVENTS.NOTIFICATION.COUNT(userId), {
			count: unreadCount,
		})
	} catch (error) {
		console.error('Error emitting notification count:', error)
		return false
	}
}

/**
 * Emit notification read event
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification ID
 * @returns {boolean} Success status
 */
function emitNotificationRead(userId, notificationId) {
	return emitToUser(userId, SOCKET_EVENTS.NOTIFICATION.READ(userId), {
		notificationId,
		timestamp: new Date().toISOString(),
	})
}

module.exports = {
	emitNewNotification,
	emitNotificationCount,
	emitNotificationRead,
}
