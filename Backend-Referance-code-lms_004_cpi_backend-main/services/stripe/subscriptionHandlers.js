const { Subscription } = require('../../models/app/subscription_model')
const {
	SubscriptionPlan,
} = require('../../models/common/subscription_plan_model')
const { sendNotificationToUser } = require('../expoPushNotification')
const subscriptionSocket = require('../socket/handlers/subscription')

function createSubscriptionHandlers({ stripeService }) {
	if (!stripeService) {
		throw new Error(
			'Stripe service is required to create subscription handlers'
		)
	}

	/**
	 * Handle checkout.session.completed event
	 * This fires when subscription is created and first payment succeeds
	 */
	const handleCheckoutSessionCompleted = async (session) => {
		try {
			if (session.mode !== 'subscription') {
				return // Not a subscription checkout
			}

			const subscriptionId = session.subscription
			const customerId = session.customer
			const userId = session.metadata?.userId

			if (!subscriptionId || !customerId || !userId) {
				console.warn(
					`⚠️ Missing required data in checkout session: ${session.id}`
				)
				return
			}

			// Retrieve full subscription from Stripe
			const stripeSubscription = await stripeService.retrieveSubscription(
				subscriptionId,
				{ expand: ['items.data.price.product'] }
			)

			// Determine plan type from price
			const priceId = stripeSubscription.items.data[0].price.id
			const plan = await SubscriptionPlan.findOne({ isActive: true }).lean()
			if (!plan) {
				console.warn('⚠️ No active plan found for subscription')
				return
			}

			const planType =
				priceId === plan.monthly.stripePriceId ? 'monthly' : 'yearly'
			const amount =
				planType === 'monthly' ? plan.monthly.amount : plan.yearly.amount

			// Create or update subscription in database
			const subscriptionData = {
				userId,
				stripeSubscriptionId: subscriptionId,
				stripeCustomerId: customerId,
				status: stripeSubscription.status,
				plan: planType,
				priceId: priceId,
				amount: amount,
				currency: stripeSubscription.currency,
				currentPeriodStart: new Date(
					stripeSubscription.current_period_start * 1000
				),
				currentPeriodEnd: new Date(
					stripeSubscription.current_period_end * 1000
				),
				cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
				totalPaid: amount, // First payment
				invoiceCount: 1,
			}

			let subscription = await Subscription.findOne({
				stripeSubscriptionId: subscriptionId,
			})

			if (subscription) {
				await Subscription.findByIdAndUpdate(subscription._id, subscriptionData)
			} else {
				subscription = await Subscription.create(subscriptionData)
			}

			console.log(
				`✅ Subscription ${subscriptionId} activated for user ${userId}`
			)

			// Emit socket event
			subscriptionSocket.emitSubscriptionActivated(userId, {
				subscriptionId: subscription._id,
				status: subscription.status,
				plan: subscription.plan,
			})

			// Send notification
			await sendNotificationToUser({
				userId,
				notificationKey: 'subscription_activated',
			})
		} catch (error) {
			console.error('Error handling checkout session completed:', error)
		}
	}

	/**
	 * Handle customer.subscription.created event
	 */
	const handleSubscriptionCreated = async (stripeSubscription) => {
		try {
			const userId = stripeSubscription.metadata?.userId
			if (!userId) {
				console.warn(
					`⚠️ Subscription ${stripeSubscription.id} missing userId in metadata`
				)
				return
			}

			console.log(
				`📝 Subscription created: ${stripeSubscription.id} for user ${userId}`
			)
			// Subscription record will be created by checkout.session.completed
		} catch (error) {
			console.error('Error handling subscription created:', error)
		}
	}

	/**
	 * Handle customer.subscription.updated event
	 */
	const handleSubscriptionUpdated = async (stripeSubscription) => {
		try {
			const subscription = await Subscription.findOne({
				stripeSubscriptionId: stripeSubscription.id,
			})

			if (!subscription) {
				console.warn(
					`⚠️ Subscription not found in DB: ${stripeSubscription.id}`
				)
				return
			}

			// Determine plan type
			const priceId = stripeSubscription.items.data[0].price.id
			const plan = await SubscriptionPlan.findOne({ isActive: true }).lean()
			let planType = subscription.plan
			let amount = subscription.amount

			if (plan) {
				if (priceId === plan.monthly.stripePriceId) {
					planType = 'monthly'
					amount = plan.monthly.amount
				} else if (priceId === plan.yearly.stripePriceId) {
					planType = 'yearly'
					amount = plan.yearly.amount
				}
			}

			// Update subscription
			const updateData = {
				status: stripeSubscription.status,
				plan: planType,
				priceId: priceId,
				amount: amount,
				currentPeriodStart: new Date(
					stripeSubscription.current_period_start * 1000
				),
				currentPeriodEnd: new Date(
					stripeSubscription.current_period_end * 1000
				),
				cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
			}

			if (stripeSubscription.canceled_at) {
				updateData.canceledAt = new Date(stripeSubscription.canceled_at * 1000)
			}

			await Subscription.findByIdAndUpdate(subscription._id, updateData)

			// Handle status changes
			if (
				subscription.status !== 'active' &&
				stripeSubscription.status === 'active'
			) {
				// Subscription reactivated
				console.log(
					`✅ Subscription ${stripeSubscription.id} reactivated for user ${subscription.userId}`
				)
			} else if (
				subscription.status === 'active' &&
				stripeSubscription.status !== 'active'
			) {
				// Subscription deactivated
				console.log(
					`🚫 Subscription ${stripeSubscription.id} deactivated for user ${subscription.userId}`
				)
			}

			// Emit socket event
			subscriptionSocket.emitSubscriptionUpdated(
				subscription.userId.toString(),
				{
					subscriptionId: subscription._id,
					status: stripeSubscription.status,
					plan: planType,
				}
			)
		} catch (error) {
			console.error('Error handling subscription updated:', error)
		}
	}

	/**
	 * Handle customer.subscription.deleted event
	 */
	const handleSubscriptionDeleted = async (stripeSubscription) => {
		try {
			const subscription = await Subscription.findOne({
				stripeSubscriptionId: stripeSubscription.id,
			})

			if (!subscription) {
				console.warn(
					`⚠️ Subscription not found in DB: ${stripeSubscription.id}`
				)
				return
			}

			// Update subscription status
			await Subscription.findByIdAndUpdate(subscription._id, {
				status: 'canceled',
				canceledAt: new Date(),
				cancelAtPeriodEnd: false,
			})

			console.log(
				`🚫 Subscription ${stripeSubscription.id} canceled for user ${subscription.userId}`
			)

			// Emit socket event
			subscriptionSocket.emitSubscriptionCanceled(
				subscription.userId.toString(),
				{
					subscriptionId: subscription._id,
				}
			)

			// Send notification
			await sendNotificationToUser({
				userId: subscription.userId,
				notificationKey: 'subscription_canceled',
			})
		} catch (error) {
			console.error('Error handling subscription deleted:', error)
		}
	}

	/**
	 * Handle invoice.paid event
	 */
	const handleInvoicePaid = async (invoice) => {
		try {
			if (!invoice.subscription) {
				return // Not a subscription invoice
			}

			const subscription = await Subscription.findOne({
				stripeSubscriptionId: invoice.subscription,
			})

			if (!subscription) {
				console.warn(`⚠️ Subscription not found for invoice: ${invoice.id}`)
				return
			}

			// Update total paid and invoice count
			await Subscription.findByIdAndUpdate(subscription._id, {
				$inc: {
					totalPaid: invoice.amount_paid,
					invoiceCount: 1,
				},
			})

			console.log(
				`💰 Invoice ${invoice.id} paid for subscription ${invoice.subscription}`
			)

			// Emit socket event
			subscriptionSocket.emitInvoicePaid(subscription.userId.toString(), {
				invoiceId: invoice.id,
				amount: invoice.amount_paid,
				currency: invoice.currency,
			})
		} catch (error) {
			console.error('Error handling invoice paid:', error)
		}
	}

	/**
	 * Handle invoice.payment_failed event
	 */
	const handleInvoicePaymentFailed = async (invoice) => {
		try {
			if (!invoice.subscription) {
				return // Not a subscription invoice
			}

			const subscription = await Subscription.findOne({
				stripeSubscriptionId: invoice.subscription,
			})

			if (!subscription) {
				console.warn(`⚠️ Subscription not found for invoice: ${invoice.id}`)
				return
			}

			// Update subscription status to past_due
			await Subscription.findByIdAndUpdate(subscription._id, {
				status: 'past_due',
			})

			console.log(
				`❌ Invoice ${invoice.id} payment failed for subscription ${invoice.subscription}`
			)

			// Emit socket event
			subscriptionSocket.emitPaymentFailed(subscription.userId.toString(), {
				invoiceId: invoice.id,
				subscriptionId: subscription._id,
			})

			// Send notification
			await sendNotificationToUser({
				userId: subscription.userId,
				notificationKey: 'subscription_payment_failed',
			})
		} catch (error) {
			console.error('Error handling invoice payment failed:', error)
		}
	}

	return {
		handleCheckoutSessionCompleted,
		handleSubscriptionCreated,
		handleSubscriptionUpdated,
		handleSubscriptionDeleted,
		handleInvoicePaid,
		handleInvoicePaymentFailed,
	}
}

module.exports = { createSubscriptionHandlers }
