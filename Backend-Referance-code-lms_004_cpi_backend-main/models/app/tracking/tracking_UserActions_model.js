const mongoose = require('mongoose')
const Joi = require('joi')
const { Schema } = require('mongoose')

const Tracking_UserActionsSchema = mongoose.Schema(
	{
		action: {
			type: String,
		},
		date: {
			type: Date,
		},
		userId: {
			type: String,
		},
	},
	{
		timestamps: true,
	}
)

const Tracking_UserActions = mongoose.model(
	'Tracking_UserActions',
	Tracking_UserActionsSchema
)

function validateTracking_UserActions(req) {
	const schema = Joi.object({
		action: Joi.string(),
		date: Joi.date(),
		userId: Joi.string(),
	})
	return schema.validate(req)
}

exports.Tracking_UserActions = Tracking_UserActions
exports.validateTracking_UserActions = validateTracking_UserActions
