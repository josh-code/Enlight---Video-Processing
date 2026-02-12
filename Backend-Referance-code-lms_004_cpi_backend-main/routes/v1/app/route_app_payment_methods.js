const express = require('express')
const auth = require('../../../middleware/auth')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const { User } = require('../../../models/app/user_model')
const { Subscription } = require('../../../models/app/subscription_model')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')
const stripeService = require('../../../services/stripe/stripeService')
const router = express.Router()

/**
 * Helper function to ensure user has Stripe customer
 */
async function ensureStripeCustomer(user) {
	if (user.stripeCustomerId) {
		return user.stripeCustomerId
	}

	const emailToUse = user.email
	if (!emailToUse) {
		throw new ErrorHandler(
			'Email is required to manage payment methods',
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

/**
 * GET /payment-methods
 * List all saved payment methods with default flags
 */
router.get(
	'/',
	auth,
	catchAsyncError(async (req, res, next) => {
		const customerId = req.user.stripeCustomerId

		if (!customerId) {
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: { paymentMethods: [] },
				message: 'No payment methods found',
			})
		}

		try {
			// Get customer to check default payment method
			const customer = await stripeService.retrieveCustomer(customerId)
			const customerDefaultPmId =
				customer.invoice_settings?.default_payment_method

			// Get active subscription to check subscription default
			const subscription = await Subscription.findOne({
				userId: req.user._id,
				status: { $in: ['active', 'trialing', 'past_due'] },
			})

			let subscriptionDefaultPmId = null
			if (subscription) {
				const stripeSubscription = await stripeService.retrieveSubscription(
					subscription.stripeSubscriptionId
				)
				subscriptionDefaultPmId = stripeSubscription.default_payment_method
			}

			// Get all payment methods
			const paymentMethods = await stripeService.listPaymentMethods(
				customerId,
				'card'
			)

			// Format payment methods with default flags
			const formattedPaymentMethods = paymentMethods.data.map((pm) => ({
				id: pm.id,
				brand: pm.card.brand,
				last4: pm.card.last4,
				expMonth: pm.card.exp_month,
				expYear: pm.card.exp_year,
				funding: pm.card.funding,
				isCustomerDefault: pm.id === customerDefaultPmId,
				isSubscriptionDefault: pm.id === subscriptionDefaultPmId,
			}))

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: { paymentMethods: formattedPaymentMethods },
				message: 'Payment methods retrieved successfully',
			})
		} catch (error) {
			console.error('Error fetching payment methods:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to fetch payment methods',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

/**
 * POST /payment-methods/create-setup-intent
 * Create a SetupIntent to add a new card
 */
router.post(
	'/create-setup-intent',
	auth,
	catchAsyncError(async (req, res, next) => {
		const user = req.user
		const { email } = req.body

		console.log(`🔧 Creating setup intent for user ${user._id}`)

		// Determine which email to use
		const emailToUse = user.email || email

		if (!emailToUse) {
			return next(
				new ErrorHandler(
					'Email is required to save card details',
					HTTP.BAD_REQUEST
				)
			)
		}

		let customerId = user.stripeCustomerId

		if (!customerId) {
			const customer = await stripeService.createCustomer({
				name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
				email: emailToUse,
				metadata: {
					userId: user._id.toString(),
				},
			})
			customerId = customer.id

			await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId })
			console.log(`👤 Created new Stripe customer for setup: ${customerId}`)
		} else if (!user.email && email) {
			// Update existing customer with email if user doesn't have one
			await stripeService.updateCustomer(customerId, { email: emailToUse })
			console.log(
				`📧 Updated existing Stripe customer ${customerId} with email: ${emailToUse}`
			)
		}

		// Update user database with email if they don't have one
		if (!user.email && email) {
			await User.findByIdAndUpdate(user._id, { email: email })
			console.log(`👤 Updated user ${user._id} with email: ${email}`)
		}

		const setupIntent = await stripeService.createSetupIntent({
			customer: customerId,
			payment_method_types: ['card'],
			metadata: {
				userId: user._id.toString(),
			},
		})

		console.log(`🛠️ Created setup intent: ${setupIntent.id}`)

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { clientSecret: setupIntent.client_secret },
			message: 'Setup intent created successfully',
		})
	})
)

/**
 * POST /payment-methods
 * Attach a payment method to customer and optionally set as default
 */
router.post(
	'/',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { paymentMethodId, setAsDefault = true } = req.body

		if (!paymentMethodId) {
			return next(
				new ErrorHandler('Payment method ID is required', HTTP.BAD_REQUEST)
			)
		}

		const customerId = await ensureStripeCustomer(req.user)

		try {
			// Check if already attached
			const paymentMethod =
				await stripeService.retrievePaymentMethod(paymentMethodId)

			if (paymentMethod.customer !== customerId) {
				// Attach payment method to customer
				await stripeService.attachPaymentMethod(paymentMethodId, customerId)
				console.log(
					`💳 Attached payment method ${paymentMethodId} to customer ${customerId}`
				)
			}

			// Set as customer default if requested
			if (setAsDefault) {
				await stripeService.updateCustomer(customerId, {
					invoice_settings: {
						default_payment_method: paymentMethodId,
					},
				})
				console.log(`✅ Set ${paymentMethodId} as customer default`)
			}

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: { paymentMethodId, isDefault: setAsDefault },
				message: 'Payment method added successfully',
			})
		} catch (error) {
			console.error('Error adding payment method:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to add payment method',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

/**
 * DELETE /payment-methods/:id
 * Remove a saved payment method
 */
router.delete(
	'/:id',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { id } = req.params

		if (!id) {
			return next(
				new ErrorHandler('Payment method ID is required', HTTP.BAD_REQUEST)
			)
		}

		try {
			// Check if this payment method is the subscription's default
			const subscription = await Subscription.findOne({
				userId: req.user._id,
				status: { $in: ['active', 'trialing', 'past_due'] },
			})

			if (subscription) {
				const stripeSubscription = await stripeService.retrieveSubscription(
					subscription.stripeSubscriptionId
				)

				if (stripeSubscription.default_payment_method === id) {
					return next(
						new ErrorHandler(
							'Cannot delete payment method currently used by subscription. Please set a different payment method first.',
							HTTP.BAD_REQUEST
						)
					)
				}
			}

			// Detach payment method from customer
			await stripeService.detachPaymentMethod(id)

			console.log(`🗑️ Detached payment method ${id}`)

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: { paymentMethodId: id },
				message: 'Payment method removed successfully',
			})
		} catch (error) {
			console.error('Error removing payment method:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to remove payment method',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

/**
 * PUT /payment-methods/default
 * Set customer default payment method (for new subscriptions)
 */
router.put(
	'/default',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { paymentMethodId } = req.body

		if (!paymentMethodId) {
			return next(
				new ErrorHandler('Payment method ID is required', HTTP.BAD_REQUEST)
			)
		}

		const customerId = req.user.stripeCustomerId

		if (!customerId) {
			return next(
				new ErrorHandler('No Stripe customer found', HTTP.BAD_REQUEST)
			)
		}

		try {
			// Verify payment method belongs to this customer
			const paymentMethod =
				await stripeService.retrievePaymentMethod(paymentMethodId)
			if (paymentMethod.customer !== customerId) {
				return next(
					new ErrorHandler(
						'Payment method does not belong to this customer',
						HTTP.FORBIDDEN
					)
				)
			}

			// Set as customer default
			await stripeService.updateCustomer(customerId, {
				invoice_settings: {
					default_payment_method: paymentMethodId,
				},
			})

			console.log(`✅ Set ${paymentMethodId} as customer default`)

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: { paymentMethodId },
				message: 'Default payment method updated successfully',
			})
		} catch (error) {
			console.error('Error setting default payment method:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to set default payment method',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

/**
 * GET /payment-methods/subscription-default
 * Get the current subscription's payment method
 */
router.get(
	'/subscription-default',
	auth,
	catchAsyncError(async (req, res, next) => {
		const subscription = await Subscription.findOne({
			userId: req.user._id,
			status: { $in: ['active', 'trialing', 'past_due'] },
		})

		if (!subscription) {
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: null,
				message: 'No active subscription found',
			})
		}

		try {
			const stripeSubscription = await stripeService.retrieveSubscription(
				subscription.stripeSubscriptionId,
				{ expand: ['default_payment_method'] }
			)

			const paymentMethod = stripeSubscription.default_payment_method

			if (!paymentMethod || typeof paymentMethod === 'string') {
				return sendResponse({
					res,
					status: true,
					code: HTTP.OK,
					data: null,
					message: 'No payment method set for subscription',
				})
			}

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: {
					id: paymentMethod.id,
					brand: paymentMethod.card.brand,
					last4: paymentMethod.card.last4,
					expMonth: paymentMethod.card.exp_month,
					expYear: paymentMethod.card.exp_year,
				},
				message: 'Subscription payment method retrieved successfully',
			})
		} catch (error) {
			console.error('Error fetching subscription payment method:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to fetch subscription payment method',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

/**
 * PUT /payment-methods/subscription-default
 * Change the subscription's payment method
 */
router.put(
	'/subscription-default',
	auth,
	catchAsyncError(async (req, res, next) => {
		const { paymentMethodId, updateCustomerDefault = false } = req.body

		if (!paymentMethodId) {
			return next(
				new ErrorHandler('Payment method ID is required', HTTP.BAD_REQUEST)
			)
		}

		const subscription = await Subscription.findOne({
			userId: req.user._id,
			status: { $in: ['active', 'trialing', 'past_due'] },
		})

		if (!subscription) {
			return next(
				new ErrorHandler('No active subscription found', HTTP.NOT_FOUND)
			)
		}

		const customerId = req.user.stripeCustomerId

		try {
			// Verify payment method belongs to this customer
			const paymentMethod =
				await stripeService.retrievePaymentMethod(paymentMethodId)
			if (paymentMethod.customer !== customerId) {
				return next(
					new ErrorHandler(
						'Payment method does not belong to this customer',
						HTTP.FORBIDDEN
					)
				)
			}

			// Update subscription's default payment method
			await stripeService.updateSubscription(
				subscription.stripeSubscriptionId,
				{
					default_payment_method: paymentMethodId,
				}
			)

			console.log(
				`✅ Updated subscription ${subscription.stripeSubscriptionId} payment method to ${paymentMethodId}`
			)

			// Optionally update customer default too
			if (updateCustomerDefault) {
				await stripeService.updateCustomer(customerId, {
					invoice_settings: {
						default_payment_method: paymentMethodId,
					},
				})
				console.log(
					`✅ Also updated customer ${customerId} default to ${paymentMethodId}`
				)
			}

			sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: {
					paymentMethodId,
					subscriptionId: subscription._id,
					customerDefaultUpdated: updateCustomerDefault,
				},
				message: 'Subscription payment method updated successfully',
			})
		} catch (error) {
			console.error('Error updating subscription payment method:', error)
			return next(
				new ErrorHandler(
					error.message || 'Failed to update subscription payment method',
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}
	})
)

module.exports = router
