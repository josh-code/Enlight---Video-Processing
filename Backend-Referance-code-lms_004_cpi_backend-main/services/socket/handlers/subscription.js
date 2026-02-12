const { emitToUser, SOCKET_EVENTS } = require('../index')

/**
 * Emit subscription activated event
 * @param {string} userId - User ID
 * @param {Object} data - Subscription data
 * @returns {boolean} Success status
 */
function emitSubscriptionActivated(userId, data) {
	return emitToUser(userId, SOCKET_EVENTS.SUBSCRIPTION.ACTIVATED(userId), {
		subscriptionId: data.subscriptionId,
		status: data.status,
		plan: data.plan,
		timestamp: new Date().toISOString(),
	})
}

/**
 * Emit subscription updated event
 * @param {string} userId - User ID
 * @param {Object} data - Subscription data
 * @returns {boolean} Success status
 */
function emitSubscriptionUpdated(userId, data) {
	return emitToUser(userId, SOCKET_EVENTS.SUBSCRIPTION.UPDATED(userId), {
		subscriptionId: data.subscriptionId,
		status: data.status,
		plan: data.plan,
		timestamp: new Date().toISOString(),
	})
}

/**
 * Emit subscription canceled event
 * @param {string} userId - User ID
 * @param {Object} data - Subscription data
 * @returns {boolean} Success status
 */
function emitSubscriptionCanceled(userId, data) {
	return emitToUser(userId, SOCKET_EVENTS.SUBSCRIPTION.CANCELED(userId), {
		subscriptionId: data.subscriptionId,
		timestamp: new Date().toISOString(),
	})
}

/**
 * Emit invoice paid event
 * @param {string} userId - User ID
 * @param {Object} data - Invoice data
 * @returns {boolean} Success status
 */
function emitInvoicePaid(userId, data) {
	return emitToUser(userId, SOCKET_EVENTS.SUBSCRIPTION.INVOICE_PAID(userId), {
		invoiceId: data.invoiceId,
		amount: data.amount,
		currency: data.currency,
		timestamp: new Date().toISOString(),
	})
}

/**
 * Emit payment failed event for subscription
 * @param {string} userId - User ID
 * @param {Object} data - Payment failure data
 * @returns {boolean} Success status
 */
function emitPaymentFailed(userId, data) {
	return emitToUser(userId, SOCKET_EVENTS.SUBSCRIPTION.PAYMENT_FAILED(userId), {
		invoiceId: data.invoiceId,
		subscriptionId: data.subscriptionId,
		timestamp: new Date().toISOString(),
	})
}

module.exports = {
	emitSubscriptionActivated,
	emitSubscriptionUpdated,
	emitSubscriptionCanceled,
	emitInvoicePaid,
	emitPaymentFailed,
}
