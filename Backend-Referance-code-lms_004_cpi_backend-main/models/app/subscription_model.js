const mongoose = require('mongoose')
const Joi = require('joi')

const subscriptionSchema = new mongoose.Schema(
	{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		stripeSubscriptionId: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},
		stripeCustomerId: {
			type: String,
			required: true,
			index: true,
		},
		status: {
			type: String,
			enum: [
				'active',
				'past_due',
				'canceled',
				'incomplete',
				'incomplete_expired',
				'trialing',
				'unpaid',
				'paused',
			],
			default: 'incomplete',
			index: true,
		},
		plan: {
			type: String,
			enum: ['monthly', 'yearly'],
			required: true,
		},
		priceId: {
			type: String,
			required: true,
		},
		amount: {
			type: Number,
			required: true,
		},
		currency: {
			type: String,
			default: 'usd',
		},
		currentPeriodStart: {
			type: Date,
		},
		currentPeriodEnd: {
			type: Date,
		},
		cancelAtPeriodEnd: {
			type: Boolean,
			default: false,
		},
		canceledAt: {
			type: Date,
		},
		cancellationReason: {
			type: String,
		},
		totalPaid: {
			type: Number,
			default: 0,
		},
		invoiceCount: {
			type: Number,
			default: 0,
		},
		trialStart: {
			type: Date,
		},
		trialEnd: {
			type: Date,
		},
	},
	{
		timestamps: true,
	}
)

const Subscription = mongoose.model('Subscription', subscriptionSchema)

function validateSubscription(req) {
	const schema = Joi.object({
		priceId: Joi.string().required(),
		paymentMethodId: Joi.string().optional(),
	})

	return schema.validate(req)
}

exports.Subscription = Subscription
exports.validateSubscription = validateSubscription
