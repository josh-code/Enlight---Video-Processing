const mongoose = require('mongoose')
const Joi = require('joi')

const NotificationSchema = mongoose.Schema({
	createdDate: {
		type: Date,
	},
	recipients: [String],
	title: Object,
	message: Object,
	read: {
		type: Boolean,
	},
})

const Notification = mongoose.model('Notification', NotificationSchema)

function validateNotification(req) {
	const schema = Joi.object({
		createdDate: Joi.date(),
		recipients: Joi.array(),
		title: Joi.object(),
		message: Joi.object(),
		read: Joi.boolean(),
	})
	return schema.validate(req)
}

exports.Notification = Notification
exports.validateNotification = validateNotification
