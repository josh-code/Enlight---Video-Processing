const { Router } = require('express')
const auth = require('../../../middleware/auth')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const { User } = require('../../../models/app/user_model')
const {
	SubscriptionPlan,
} = require('../../../models/common/subscription_plan_model')
const { Subscription } = require('../../../models/app/subscription_model')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')
const stripeService = require('../../../services/stripe/stripeService')
const router = Router()

// Helper function to ensure user has Stripe customer
async function ensureStripeCustomer(user) {
	if (user.stripeCustomerId) {
		return user.stripeCustomerId
	}

	const emailToUse = user.email
	if (!emailToUse) {
		throw new ErrorHandler(
			'Email is required to create subscription',
			HTTP.BAD_REQUEST
		)
	}

	const customer = await stripeService.createCustomer({
		name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
		email: emailToUse,
		metadata: {
			userId: user._id.toString(),
		},
	})

	await User.findByIdAndUpdate(user._id, {
		stripeCustomerId: customer.id,
	})

	console.log(
		`👤 Created new Stripe customer: ${customer.id} for user ${user._id}`
	)
	return customer.id
}

// Get subscription plan details
router.get(
	'/plan',
	catchAsyncError(async (req, res, next) => {
		const plan = await SubscriptionPlan.findOne({ isActive: true }).lean()

		if (!plan) {
			return next(
				new ErrorHandler('No active subscription plan found', HTTP.NOT_FOUND)
			)
		}

		// Format prices for frontend
		const formattedPlan = {
			_id: plan._id,
			name: plan.name,
			description: plan.description,
			features: plan.features,
			monthly: {
				...plan.monthly,
				formatted: formatCurrency(plan.monthly.amount, plan.monthly.currency),
			},
			yearly: {
				...plan.yearly,
				formatted: formatCurrency(plan.yearly.amount, plan.yearly.currency),
				monthlyEquivalentFormatted: plan.yearly.monthlyEquivalent
					? formatCurrency(
							plan.yearly.monthlyEquivalent * 100,
							plan.yearly.currency
						)
					: null,
			},
		}

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: formattedPlan,
			message: 'Subscription plan retrieved successfully',
		})
	})
)

// Create subscription
router.post(
	'/create',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { priceId, paymentMethodId } = req.body
		const userId = req.user._id.toString()

		if (!priceId) {
			return next(new ErrorHandler('Price ID is required', HTTP.BAD_REQUEST))
		}

		// Verify priceId belongs to active plan
		const plan = await SubscriptionPlan.findOne({ isActive: true }).lean()
		if (!plan) {
			return next(
				new ErrorHandler('No active subscription plan found', HTTP.NOT_FOUND)
			)
		}

		const validPriceIds = [
			plan.monthly.stripePriceId,
			plan.yearly.stripePriceId,
		]
		if (!validPriceIds.includes(priceId)) {
			return next(new ErrorHandler('Invalid price ID', HTTP.BAD_REQUEST))
		}

		// Check if user already has active subscription
		const existingSubscription = await Subscription.findOne({
			userId: req.user._id,
			status: { $in: ['active', 'trialing', 'past_due'] },
		})

		if (existingSubscription) {
			return next(
				new ErrorHandler(
					'User already has an active subscription',
					HTTP.CONFLICT
				)
			)
		}

		// Ensure Stripe customer exists
		const customerId = await ensureStripeCustomer(req.user)

		// Determine plan type
		const planType =
			priceId === plan.monthly.stripePriceId ? 'monthly' : 'yearly'
		const amount =
			planType === 'monthly' ? plan.monthly.amount : plan.yearly.amount

		// Create subscription in Stripe
		const subscriptionData = {
			customer: customerId,
			items: [{ price: priceId }],
			payment_behavior: 'default_incomplete',
			expand: ['latest_invoice.payment_intent'],
			metadata: {
				userId: userId,
				plan: planType,
			},
		}

		// Attach payment method if provided
		if (paymentMethodId) {
			subscriptionData.default_payment_method = paymentMethodId
		}

		try {
			const subscription =
				await stripeService.createSubscription(subscriptionData)

			console.log(
				`💳 Created subscription: ${subscription.id} for user ${userId}`
			)

			sendResponse({
				res,
				status: true,
				code: HTTP.CREATED,
				data: {
					subscriptionId: subscription.id,
					clientSecret:
						subscription.latest_invoice.payment_intent.client_secret,
				},
				message: 'Subscription created successfully',
			})
		} catch (error) {
			console.error('Error creating subscription:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to create subscription',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

// Get user's subscription status
router.get(
	'/status',
	auth,
	catchAsyncError(async (req, res, next) => {
		const subscription = await Subscription.findOne({
			userId: req.user._id,
		})
			.sort({ createdAt: -1 })
			.lean()

		if (!subscription) {
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'No subscription found',
			})
		}

		// Format subscription data
		const formattedSubscription = {
			_id: subscription._id,
			status: subscription.status,
			plan: subscription.plan,
			amount: subscription.amount,
			currency: subscription.currency,
			formattedAmount: formatCurrency(
				subscription.amount,
				subscription.currency
			),
			currentPeriodStart: subscription.currentPeriodStart,
			currentPeriodEnd: subscription.currentPeriodEnd,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
			canceledAt: subscription.canceledAt,
			totalPaid: subscription.totalPaid,
			invoiceCount: subscription.invoiceCount,
			createdAt: subscription.createdAt,
			updatedAt: subscription.updatedAt,
		}

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: formattedSubscription,
			message: 'Subscription status retrieved successfully',
		})
	})
)

// Cancel subscription
router.post(
	'/cancel',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { cancelAtPeriodEnd = true } = req.body

		const subscription = await Subscription.findOne({
			userId: req.user._id,
			status: { $in: ['active', 'trialing', 'past_due'] },
		})

		if (!subscription) {
			return next(
				new ErrorHandler('No active subscription found', HTTP.NOT_FOUND)
			)
		}

		try {
			if (cancelAtPeriodEnd) {
				// Cancel at period end
				await stripeService.updateSubscription(
					subscription.stripeSubscriptionId,
					{
						cancel_at_period_end: true,
					}
				)

				await Subscription.findByIdAndUpdate(subscription._id, {
					cancelAtPeriodEnd: true,
				})

				sendResponse({
					res,
					status: true,
					code: HTTP.OK,
					data: {
						canceledAtPeriodEnd: true,
						currentPeriodEnd: subscription.currentPeriodEnd,
					},
					message:
						'Subscription will be canceled at the end of the current period',
				})
			} else {
				// Cancel immediately
				await stripeService.cancelSubscription(
					subscription.stripeSubscriptionId
				)

				await Subscription.findByIdAndUpdate(subscription._id, {
					status: 'canceled',
					cancelAtPeriodEnd: false,
					canceledAt: new Date(),
				})

				sendResponse({
					res,
					status: true,
					code: HTTP.OK,
					data: {
						canceled: true,
					},
					message: 'Subscription canceled successfully',
				})
			}
		} catch (error) {
			console.error('Error canceling subscription:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to cancel subscription',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

// Update subscription plan (switch monthly ↔ yearly)
router.post(
	'/update-plan',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { newPriceId } = req.body

		if (!newPriceId) {
			return next(
				new ErrorHandler('New price ID is required', HTTP.BAD_REQUEST)
			)
		}

		const subscription = await Subscription.findOne({
			userId: req.user._id,
			status: { $in: ['active', 'trialing'] },
		})

		if (!subscription) {
			return next(
				new ErrorHandler('No active subscription found', HTTP.NOT_FOUND)
			)
		}

		// Verify new priceId belongs to active plan
		const plan = await SubscriptionPlan.findOne({ isActive: true }).lean()
		if (!plan) {
			return next(
				new ErrorHandler('No active subscription plan found', HTTP.NOT_FOUND)
			)
		}

		const validPriceIds = [
			plan.monthly.stripePriceId,
			plan.yearly.stripePriceId,
		]
		if (!validPriceIds.includes(newPriceId)) {
			return next(new ErrorHandler('Invalid price ID', HTTP.BAD_REQUEST))
		}

		// Don't allow switching to same plan
		if (subscription.priceId === newPriceId) {
			return next(
				new ErrorHandler('Already subscribed to this plan', HTTP.BAD_REQUEST)
			)
		}

		try {
			// Get subscription items
			const stripeSubscription = await stripeService.retrieveSubscription(
				subscription.stripeSubscriptionId
			)

			const subscriptionItemId = stripeSubscription.items.data[0].id
			const newPlanType =
				newPriceId === plan.monthly.stripePriceId ? 'monthly' : 'yearly'
			const newAmount =
				newPlanType === 'monthly' ? plan.monthly.amount : plan.yearly.amount

			// Update subscription
			await stripeService.updateSubscription(
				subscription.stripeSubscriptionId,
				{
					items: [
						{
							id: subscriptionItemId,
							price: newPriceId,
						},
					],
					proration_behavior: 'create_prorations',
					metadata: {
						...stripeSubscription.metadata,
						plan: newPlanType,
					},
				}
			)

			// Update in database
			await Subscription.findByIdAndUpdate(subscription._id, {
				plan: newPlanType,
				priceId: newPriceId,
				amount: newAmount,
			})

			console.log(
				`🔄 Updated subscription ${subscription.stripeSubscriptionId} to ${newPlanType} plan`
			)

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: {
					plan: newPlanType,
					priceId: newPriceId,
				},
				message: 'Subscription plan updated successfully',
			})
		} catch (error) {
			console.error('Error updating subscription plan:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to update subscription plan',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

// Get invoices/payment history
router.get(
	'/invoices',
	auth,
	catchAsyncError(async (req, res, next) => {
		const customerId = req.user.stripeCustomerId
		const limit = parseInt(req.query.limit) || 10
		const startingAfter = req.query.starting_after || null

		if (!customerId) {
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: [],
				message: 'No invoices found',
			})
		}

		try {
			const params = {
				customer: customerId,
				limit: Math.min(limit, 100), // Max 100
			}

			if (startingAfter) {
				params.starting_after = startingAfter
			}

			const invoices = await stripeService.listInvoices(params)

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: {
					invoices: invoices.data,
					hasMore: invoices.has_more,
				},
				message: 'Invoices retrieved successfully',
			})
		} catch (error) {
			console.error('Error fetching invoices:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to fetch invoices',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

module.exports = router
