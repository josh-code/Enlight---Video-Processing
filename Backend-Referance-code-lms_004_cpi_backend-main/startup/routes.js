const express = require('express')
const config = require('config')
const v1Routes = require('../routes/v1')
const errorHandler = require('../middleware/error')
const stripeService = require('../services/stripe/stripeService')
const { createSubscriptionHandlers } = require('../services/stripe')
const { apiVersionMiddleware } = require('../middleware/apiVersion')
const {
	importMcCheynePlan,
} = require('../services/readingPlan/importMcCheynePlan')

const stripeWebhookSecret = config.get('STRIPE_WEBHOOK_SECRET')

// Initialize subscription handlers
const {
	handleCheckoutSessionCompleted,
	handleSubscriptionCreated,
	handleSubscriptionUpdated,
	handleSubscriptionDeleted,
	handleInvoicePaid,
	handleInvoicePaymentFailed,
} = createSubscriptionHandlers({ stripeService })

module.exports = function (app) {
	app.post(
		'/stripe-webhook',
		express.raw({ type: 'application/json' }),
		async (req, res) => {
			const sig = req.headers['stripe-signature']

			let event
			try {
				event = stripeService.constructWebhookEvent(
					req.body,
					sig,
					stripeWebhookSecret
				)
			} catch (error) {
				console.error(
					`⚠️ Webhook signature verification failed:`,
					error.message
				)
				return res.status(400).send(`Webhook Error: ${error.message}`)
			}

			switch (event.type) {
				// Payment intent events (existing)
				case 'payment_intent.succeeded':
					await handlePaymentSuccess(event.data.object)
					break

				case 'payment_intent.payment_failed':
					await handlePaymentFailure(event.data.object)
					break

				case 'charge.refunded':
					await handleChargeRefunded(event.data.object)
					break

				// Subscription events
				case 'checkout.session.completed':
					await handleCheckoutSessionCompleted(event.data.object)
					break

				case 'customer.subscription.created':
					await handleSubscriptionCreated(event.data.object)
					break

				case 'customer.subscription.updated':
					await handleSubscriptionUpdated(event.data.object)
					break

				case 'customer.subscription.deleted':
					await handleSubscriptionDeleted(event.data.object)
					break

				case 'invoice.paid':
					await handleInvoicePaid(event.data.object)
					break

				case 'invoice.payment_failed':
					await handleInvoicePaymentFailed(event.data.object)
					break

				case 'invoice.payment_action_required':
					// Handle 3D Secure or other payment action required
					console.log(
						`⚠️ Payment action required for invoice: ${event.data.object.id}`
					)
					break

				default:
					console.log(`Unhandled event type: ${event.type}`)
			}

			res.json({ received: true })
		}
	)

	//----------------------Setting route handlers--------------------------
	app.use(express.json())
	app.use(express.text({ type: 'text/plain' }))
	app.use(require('morgan')('dev'))

	app.get('/', (req, res) => {
		res.send('Hello World')
	})

	// create reading plan
	app.get('/create-reading-plan', (req, res) => {
		importMcCheynePlan()
	})

	// Versioned API routes (recommended for new clients)
	app.use('/api/v1', apiVersionMiddleware('v1'), v1Routes)

	// Global error handler middleware (must be registered after all routes)
	app.use(errorHandler)
}
