const config = require('config')

/**
 * Centralized Stripe Service
 * Singleton class that initializes Stripe once and provides all required methods
 */
class StripeService {
	constructor() {
		const stripeSecretKey = config.get('STRIPE_SECRET_KEY')
		this.stripe = require('stripe')(stripeSecretKey)
	}

	// ==================== Customer Methods ====================

	/**
	 * Create a new Stripe customer
	 * @param {Object} data - Customer data (name, email, metadata, etc.)
	 * @returns {Promise<Stripe.Customer>}
	 */
	async createCustomer(data) {
		return this.stripe.customers.create(data)
	}

	/**
	 * Update an existing Stripe customer
	 * @param {string} customerId - Stripe customer ID
	 * @param {Object} data - Data to update
	 * @returns {Promise<Stripe.Customer>}
	 */
	async updateCustomer(customerId, data) {
		return this.stripe.customers.update(customerId, data)
	}

	/**
	 * Retrieve a Stripe customer
	 * @param {string} customerId - Stripe customer ID
	 * @returns {Promise<Stripe.Customer>}
	 */
	async retrieveCustomer(customerId) {
		return this.stripe.customers.retrieve(customerId)
	}

	// ==================== Subscription Methods ====================

	/**
	 * Create a new subscription
	 * @param {Object} data - Subscription data
	 * @returns {Promise<Stripe.Subscription>}
	 */
	async createSubscription(data) {
		return this.stripe.subscriptions.create(data)
	}

	/**
	 * Update an existing subscription
	 * @param {string} subscriptionId - Stripe subscription ID
	 * @param {Object} data - Data to update
	 * @returns {Promise<Stripe.Subscription>}
	 */
	async updateSubscription(subscriptionId, data) {
		return this.stripe.subscriptions.update(subscriptionId, data)
	}

	/**
	 * Cancel a subscription
	 * @param {string} subscriptionId - Stripe subscription ID
	 * @returns {Promise<Stripe.Subscription>}
	 */
	async cancelSubscription(subscriptionId) {
		return this.stripe.subscriptions.cancel(subscriptionId)
	}

	/**
	 * Retrieve a subscription
	 * @param {string} subscriptionId - Stripe subscription ID
	 * @param {Object} options - Optional expand options
	 * @returns {Promise<Stripe.Subscription>}
	 */
	async retrieveSubscription(subscriptionId, options = {}) {
		return this.stripe.subscriptions.retrieve(subscriptionId, options)
	}

	// ==================== Payment Intent Methods ====================

	/**
	 * Create a payment intent
	 * @param {Object} data - Payment intent data
	 * @returns {Promise<Stripe.PaymentIntent>}
	 */
	async createPaymentIntent(data) {
		return this.stripe.paymentIntents.create(data)
	}

	/**
	 * Retrieve a payment intent
	 * @param {string} paymentIntentId - Stripe payment intent ID
	 * @returns {Promise<Stripe.PaymentIntent>}
	 */
	async retrievePaymentIntent(paymentIntentId) {
		return this.stripe.paymentIntents.retrieve(paymentIntentId)
	}

	// ==================== Setup Intent Methods ====================

	/**
	 * Create a setup intent for saving payment methods
	 * @param {Object} data - Setup intent data
	 * @returns {Promise<Stripe.SetupIntent>}
	 */
	async createSetupIntent(data) {
		return this.stripe.setupIntents.create(data)
	}

	// ==================== Payment Method Methods ====================

	/**
	 * List payment methods for a customer
	 * @param {string} customerId - Stripe customer ID
	 * @param {string} type - Payment method type (e.g., 'card')
	 * @returns {Promise<Stripe.ApiList<Stripe.PaymentMethod>>}
	 */
	async listPaymentMethods(customerId, type = 'card') {
		return this.stripe.paymentMethods.list({
			customer: customerId,
			type: type,
		})
	}

	/**
	 * Attach a payment method to a customer
	 * @param {string} paymentMethodId - Stripe payment method ID
	 * @param {string} customerId - Stripe customer ID
	 * @returns {Promise<Stripe.PaymentMethod>}
	 */
	async attachPaymentMethod(paymentMethodId, customerId) {
		return this.stripe.paymentMethods.attach(paymentMethodId, {
			customer: customerId,
		})
	}

	/**
	 * Detach a payment method from customer
	 * @param {string} paymentMethodId - Stripe payment method ID
	 * @returns {Promise<Stripe.PaymentMethod>}
	 */
	async detachPaymentMethod(paymentMethodId) {
		return this.stripe.paymentMethods.detach(paymentMethodId)
	}

	/**
	 * Retrieve a payment method
	 * @param {string} paymentMethodId - Stripe payment method ID
	 * @returns {Promise<Stripe.PaymentMethod>}
	 */
	async retrievePaymentMethod(paymentMethodId) {
		return this.stripe.paymentMethods.retrieve(paymentMethodId)
	}

	// ==================== Invoice Methods ====================

	/**
	 * List invoices
	 * @param {Object} params - List parameters (customer, subscription, limit, etc.)
	 * @returns {Promise<Stripe.ApiList<Stripe.Invoice>>}
	 */
	async listInvoices(params) {
		return this.stripe.invoices.list(params)
	}

	// ==================== Charge Methods ====================

	/**
	 * Retrieve a charge
	 * @param {string} chargeId - Stripe charge ID
	 * @returns {Promise<Stripe.Charge>}
	 */
	async retrieveCharge(chargeId) {
		return this.stripe.charges.retrieve(chargeId)
	}

	// ==================== Webhook Methods ====================

	/**
	 * Construct and verify a webhook event
	 * @param {Buffer|string} body - Raw request body
	 * @param {string} signature - Stripe signature header
	 * @param {string} secret - Webhook secret
	 * @returns {Stripe.Event}
	 */
	constructWebhookEvent(body, signature, secret) {
		return this.stripe.webhooks.constructEvent(body, signature, secret)
	}
}

// Export singleton instance
module.exports = new StripeService()
