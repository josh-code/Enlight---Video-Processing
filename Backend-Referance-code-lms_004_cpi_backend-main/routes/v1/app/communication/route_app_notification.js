const express = require('express')
const _ = require('lodash')
const router = express.Router()
const auth = require('../../../../middleware/auth')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const {
	Notification,
} = require('../../../../models/app/communication/notification_model')
const {
	ExpoPushNotificationToken,
} = require('../../../../models/app/communication/expoPushNotificationToken_model')
const clientTypeMiddleware = require('../../../../middleware/clientTypeMiddleware')
const featureFlagMiddleware = require('../../../../middleware/featureFlag')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

router.get(
	'/toMe',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'notificationSheet',
		mobilePath: 'notificationScreen',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user._id

		let notifications = await Notification.find({
			recipients: [userId],
		})
			.sort({ createdDate: 'descending' })
			.lean()

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Notifications retrieved successfully',
			data: notifications,
		})
	})
)

router.post(
	'/saveExpoToken',
	[auth],
	catchAsyncError(async (req, res, next) => {
		let token = req.body.token
		if (!req.body.token) {
			return next(new ErrorHandler('Token not provided', HTTP.BAD_REQUEST))
		}

		const expoToken = {
			updatedDate: new Date(),
			userId: req.user._id,
			token,
		}

		let existingTokens = await ExpoPushNotificationToken.find({
			userId: expoToken.userId,
		})
		if (existingTokens.length > 0) {
			await ExpoPushNotificationToken.findByIdAndUpdate(existingTokens[0]._id, {
				token: expoToken.token,
				updatedDate: new Date(),
			})
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: 'Expo token updated successfully',
				data: null,
			})
		}
		let PNtoken = await ExpoPushNotificationToken(expoToken).save()
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Expo token saved successfully',
			data: null,
		})
	})
)

router.put(
	'/read',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'notificationSheet',
		mobilePath: 'notificationScreen',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		let { notificationIds, sendUpdatedData } = req.body
		const userId = req.user._id

		if (notificationIds?.length > 0) {
			for (let index = 0; index < notificationIds.length; index++) {
				await Notification.findByIdAndUpdate(notificationIds[index], {
					read: true,
				})
			}
		}

		if (sendUpdatedData) {
			let notifications = await Notification.find({
				recipients: [userId],
			}).sort({ createdDate: 'descending' })
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: 'Notifications marked as read',
				data: notifications,
			})
		}

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Notifications marked as read',
			data: null,
		})
	})
)

module.exports = router
