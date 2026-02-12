const { i18next, i18nextPromise } = require('./i18next')
const { Expo } = require('expo-server-sdk')
const {
	ExpoPushNotificationToken,
} = require('../models/app/communication/expoPushNotificationToken_model')
const {
	Notification,
} = require('../models/app/communication/notification_model')
const { User } = require('../models/app/user_model')
const mongoose = require('mongoose')
const { ObjectId } = mongoose.Types
const notificationSocket = require('./socket/handlers/notification')

const expo = new Expo()

async function sendNotificationToUser({
	userId,
	notificationKey,
	variables = {},
}) {
	try {
		if (!userId) return true
		if (!notificationKey) return true

		const user = await User.aggregate([
			{ $match: { _id: new ObjectId(userId) } },
			{
				$addFields: {
					stringUserId: { $toString: '$_id' },
				},
			},
			{
				$lookup: {
					from: 'expopushnotificationtokens',
					localField: 'stringUserId',
					foreignField: 'userId',
					as: 'expoPushNotificationTokens',
				},
			},
			{ $limit: 1 },
		]).then((res) => res[0])

		if (!user) return true

		await i18nextPromise

		const userLang = user.preferredAppLanguage || 'en'

		// Process variables to handle multilingual objects
		const processedVariables = {}
		for (const [key, value] of Object.entries(variables)) {
			if (
				typeof value === 'object' &&
				value !== null &&
				(value.en || value.es)
			) {
				// Handle multilingual objects
				processedVariables[`${key}_en`] = value.en || value.es || ''
				processedVariables[`${key}_es`] = value.es || value.en || ''
			} else {
				// Handle regular variables
				processedVariables[key] = value
			}
		}

		// Generate translations for the notification
		const title = {
			en: i18next.t(`${notificationKey}.title`, {
				lng: 'en',
				...processedVariables,
			}),
			es: i18next.t(`${notificationKey}.title`, {
				lng: 'es',
				...processedVariables,
			}),
		}
		const message = {
			en: i18next.t(`${notificationKey}.body`, {
				lng: 'en',
				...processedVariables,
			}),
			es: i18next.t(`${notificationKey}.body`, {
				lng: 'es',
				...processedVariables,
			}),
		}

		const newNotification = new Notification({
			createdDate: new Date(),
			recipients: [userId],
			title,
			message,
			read: false,
		})
		await newNotification.save()

		// Emit socket event for new notification
		await notificationSocket.emitNewNotification(userId, newNotification._id)

		let userPNToken = user.expoPushNotificationTokens.filter(
			(token) => token?.token !== null
		)
		if (userPNToken.length === 0) return true

		const pushTitle = title[userLang] || title.en
		const pushBody = message[userLang] || message.en

		await expo.sendPushNotificationsAsync(
			userPNToken.map((userToken) => ({
				to: userToken.token,
				title: pushTitle,
				body: pushBody,
			}))
		)

		return true
	} catch (error) {
		console.log(error)
		return true
	}
}

async function sendNotificationToLanguageLeader(message) {
	const admins = await User.find({
		isAdmin: true,
		$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
	})
	// console.log(admins);
	if (admins.length > 0) {
		admins.forEach((admin) => {
			;(admin._id, message)
		})
	}
	return true
}

module.exports = {
	sendNotificationToUser,
	sendNotificationToLanguageLeader,
}
