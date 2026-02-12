const mongoose = require('mongoose')
const Joi = require('joi')

const subscriptionPlanSchema = new mongoose.Schema(
	{
		name: {
			type: Object,
			required: true,
		},
		description: {
			type: Object,
		},
		features: [
			{
				type: Object,
			},
		],
		monthly: {
			stripePriceId: {
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
		},
		yearly: {
			stripePriceId: {
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
			monthlyEquivalent: {
				type: Number,
			},
			savingsPercent: {
				type: Number,
			},
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	{
		timestamps: true,
	}
)

const SubscriptionPlan = mongoose.model(
	'SubscriptionPlan',
	subscriptionPlanSchema
)

function validateSubscriptionPlan(req) {
	const schema = Joi.object({
		name: Joi.object().required(),
		description: Joi.object().optional(),
		features: Joi.array().items(Joi.object()).optional(),
		monthly: Joi.object({
			stripePriceId: Joi.string().required(),
			amount: Joi.number().required(),
			currency: Joi.string().optional(),
		}).required(),
		yearly: Joi.object({
			stripePriceId: Joi.string().required(),
			amount: Joi.number().required(),
			currency: Joi.string().optional(),
			monthlyEquivalent: Joi.number().optional(),
			savingsPercent: Joi.number().optional(),
		}).required(),
		isActive: Joi.boolean().optional(),
	})

	return schema.validate(req)
}

exports.SubscriptionPlan = SubscriptionPlan
exports.validateSubscriptionPlan = validateSubscriptionPlan
