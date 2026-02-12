const { Subscription } = require('../models/app/subscription_model')

/**
 * Check if user has a valid subscription
 * Valid subscriptions: status = "active" or "trialing"
 *
 * This is the primary method for checking subscription access.
 * Subscription status is managed by Stripe webhooks and stored in the Subscription model.
 *
 * @param {string|ObjectId} userId - User ID
 * @returns {Promise<{hasAccess: boolean, subscription: Object|null}>}
 *
 * @example
 * const { hasAccess, subscription } = await hasValidSubscription(userId);
 * if (hasAccess) {
 *   console.log(`User has ${subscription.plan} subscription`);
 *   console.log(`Expires: ${subscription.currentPeriodEnd}`);
 * }
 */
async function hasValidSubscription(userId) {
	const subscription = await Subscription.findOne({
		userId,
		status: { $in: ['active', 'trialing'] },
	}).lean()

	if (subscription) {
		return {
			hasAccess: true,
			subscription,
		}
	}

	return {
		hasAccess: false,
		subscription: null,
	}
}

module.exports = { hasValidSubscription }
