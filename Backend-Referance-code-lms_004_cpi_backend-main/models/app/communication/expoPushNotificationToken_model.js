const mongoose = require('mongoose')
const Joi = require('joi')
const { Schema } = require('mongoose')

const ExpoPushNotificationTokenSchema = mongoose.Schema({
	updatedDate: {
		type: Date,
	},
	userId: {
		type: String,
	},
	token: {
		type: String,
	},
})

const ExpoPushNotificationToken = mongoose.model(
	'ExpoPushNotificationToken',
	ExpoPushNotificationTokenSchema
)

function validateExpoPushNotificationToken(req) {
	const schema = Joi.object({
		updatedDate: Joi.date(),
		userId: Joi.string(),
		token: Joi.string(),
	})
	return schema.validate(req)
}

exports.ExpoPushNotificationToken = ExpoPushNotificationToken
exports.validateExpoPushNotificationToken = validateExpoPushNotificationToken
