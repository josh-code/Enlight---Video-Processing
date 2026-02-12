const { emitToUser, emitToAll, SOCKET_EVENTS } = require('../index')

/**
 * Emit payment success event
 * @param {string} userId - User ID
 * @param {Object} data - Payment data
 * @returns {boolean} Success status
 */
function emitPaymentSuccess(userId, data) {
	const success = emitToUser(userId, SOCKET_EVENTS.PAYMENT.SUCCESS(userId), {
		userId,
		courseId: data.courseId,
		orderId: data.orderId,
		status: 'succeeded',
		paymentIntentId: data.paymentIntentId,
		emailUpdated: data.emailUpdated,
		timestamp: new Date().toISOString(),
	})

	// Also emit generic update for compatibility
	emitToAll(SOCKET_EVENTS.PAYMENT.UPDATE, {
		userId,
		courseId: data.courseId,
		orderId: data.orderId,
		status: 'succeeded',
		paymentIntentId: data.paymentIntentId,
	})

	return success
}

/**
 * Emit payment failed event
 * @param {string|null} userId - User ID (optional for guest purchases)
 * @param {Object} data - Payment data
 * @returns {boolean} Success status
 */
function emitPaymentFailed(userId, data) {
	if (userId) {
		emitToUser(userId, SOCKET_EVENTS.PAYMENT.FAILED(userId), {
			orderId: data.orderId,
			status: 'failed',
			paymentIntentId: data.paymentIntentId,
			timestamp: new Date().toISOString(),
		})
	}

	// Generic update for guest purchases
	emitToAll(SOCKET_EVENTS.PAYMENT.UPDATE, {
		orderId: data.orderId,
		status: 'failed',
		paymentIntentId: data.paymentIntentId,
	})

	return true
}

/**
 * Emit payment refunded event
 * @param {string} userId - User ID
 * @param {Object} data - Refund data
 * @returns {boolean} Success status
 */
function emitPaymentRefunded(userId, data) {
	return emitToUser(userId, SOCKET_EVENTS.PAYMENT.REFUNDED(userId), {
		orderId: data.orderId,
		status: 'refunded',
		paymentIntentId: data.paymentIntentId,
		refundAmount: data.refundAmount,
		timestamp: new Date().toISOString(),
	})
}

/**
 * Emit guest payment update (for guest purchases without userId)
 * @param {Object} data - Payment data
 * @returns {boolean} Success status
 */
function emitGuestPaymentUpdate(data) {
	return emitToAll(SOCKET_EVENTS.PAYMENT.UPDATE, {
		courseId: data.courseId,
		orderId: data.orderId,
		status: 'succeeded',
		paymentIntentId: data.paymentIntentId,
		guestEmail: data.guestEmail,
		isGuestPurchase: true,
	})
}

module.exports = {
	emitPaymentSuccess,
	emitPaymentFailed,
	emitPaymentRefunded,
	emitGuestPaymentUpdate,
}
