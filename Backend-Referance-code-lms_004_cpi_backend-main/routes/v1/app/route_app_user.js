const express = require('express')
const router = express.Router()
const _ = require('lodash')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const { parsePhoneNumberWithError } = require('libphonenumber-js')

const auth = require('../../../middleware/auth')
const admin = require('../../../middleware/admin')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')

const { User } = require('../../../models/app/user_model')
const { getUserStreakDays } = require('../../../services/userActionTracking')
const { getUserStreaksDates } = require('../../../services/userActionTracking')
const { STREAK_THRESHOLDS, BADGES } = require('../../../contant')
const { assignBadgeToUser } = require('../../../services/badge')
const UserBadges = require('../../../models/common/content/user_badges_model')
const Message = require('../../../models/common/messages_model')
const { default: mongoose } = require('mongoose')
const clientTypeMiddleware = require('../../../middleware/clientTypeMiddleware')
const featureFlagMiddleware = require('../../../middleware/featureFlag')
const {
	generateObjectUrl,
	deleteAwsObject,
} = require('../../../services/aws/utils')
const Token = require('../../../models/common/token_model')
const { createAndSendOTP, verifyOTP } = require('../../../services/otp')

// ==========================================
// CONSTANTS
// ==========================================

const TEST_OTP = '123456' // OTP for test phone numbers

router.get(
	'/getStreaks',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user._id

		const streaks = await getUserStreakDays(userId)

		await assignStreakBadges({ userId, streaks })

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Streaks retrieved successfully',
			data: { streaks },
		})
	})
)

async function assignStreakBadges({ userId, streaks }) {
	try {
		// "Daily Bread" for logging in daily for exactly 7 consecutive days
		if (streaks === STREAK_THRESHOLDS.DAILY_BREAD) {
			console.log(`Checking "Daily Bread" badge for streak: ${streaks} days`)
			const userBadge = await UserBadges.findOne({
				user: userId,
				badge: BADGES.Daily_Bread,
			})

			if (!userBadge || !wasBadgeEarnedToday(userBadge.lastEarned)) {
				console.log(`Awarding "Daily Bread" badge to user ${userId}`)
				await assignBadgeToUser(userId, BADGES.Daily_Bread)
			} else {
				console.log(`"Daily Bread" badge already earned today.`)
			}
		}

		// "Steadfast Servant" for a 10-day login streak
		if (streaks === STREAK_THRESHOLDS.STEADFAST_SERVANT) {
			console.log(
				`Checking "Steadfast Servant" badge for streak: ${streaks} days`
			)
			const userBadge = await UserBadges.findOne({
				user: userId,
				badge: BADGES.Steadfast_Servant,
			})

			if (!userBadge || !wasBadgeEarnedToday(userBadge.lastEarned)) {
				console.log(`Awarding "Steadfast Servant" badge to user ${userId}`)
				await assignBadgeToUser(userId, BADGES.Steadfast_Servant)
			} else {
				console.log(`"Steadfast Servant" badge already earned today.`)
			}
		}

		// "Beacon of Light" for logging in daily for 20 consecutive days
		if (streaks === STREAK_THRESHOLDS.BEACON_OF_LIGHT) {
			console.log(
				`Checking "Beacon of Light" badge for streak: ${streaks} days`
			)
			const userBadge = await UserBadges.findOne({
				user: userId,
				badge: BADGES.Beacon_of_Light,
			})

			if (!userBadge || !wasBadgeEarnedToday(userBadge.lastEarned)) {
				console.log(`Awarding "Beacon of Light" badge to user ${userId}`)
				await assignBadgeToUser(userId, BADGES.Beacon_of_Light)
			} else {
				console.log(`"Beacon of Light" badge already earned today.`)
			}
		}

		// "Heart of Gold" for 30 consecutive days (Earned once)
		if (streaks === STREAK_THRESHOLDS.HEART_OF_GOLD) {
			console.log(`Checking "Heart of Gold" badge for streak: ${streaks} days`)
			const userBadge = await UserBadges.findOne({
				user: userId,
				badge: BADGES.Heart_of_Gold,
			})

			if (!userBadge) {
				await assignBadgeToUser(userId, BADGES.Heart_of_Gold)
				console.log(`Awarded "Heart of Gold" badge to user ${userId}`)
			} else {
				console.log(`"Heart of Gold" badge has already been earned, skipping.`)
			}
		}
	} catch (error) {
		console.error(`Error assigning streak badges to user ${userId}:`, error)
	}
}

function wasBadgeEarnedToday(lastEarned) {
	const today = new Date()
	return (
		lastEarned &&
		lastEarned.getDate() === today.getDate() &&
		lastEarned.getMonth() === today.getMonth() &&
		lastEarned.getFullYear() === today.getFullYear()
	)
}

router.get(
	'/getMyStreaksDates',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'accountPage.loginStreaks',
		mobilePath: 'settingsScreen.loginStreaks',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user._id
		let data = await getUserStreaksDates(userId)
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Streak dates retrieved successfully',
			data,
		})
	})
)

router.get(
	'/getUserStreaksDates',
	[auth, admin],
	catchAsyncError(async (req, res, next) => {
		const userId = req.query.userId
		let data = await getUserStreaksDates(userId)
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'User streak dates retrieved successfully',
			data,
		})
	})
)

router.put(
	'/updateUserDetails',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'accountPage.profileInformation.canChangeProfileInfo',
		mobilePath: 'myProfileScreen.canUpdateProfileData',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		let userDetails = _.pick(req.body, ['name', 'email'])

		if (!userDetails.name || !userDetails.email) {
			return next(
				new ErrorHandler(
					'All fields (name, email) are required.',
					HTTP.BAD_REQUEST
				)
			)
		}

		let user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		user = await User.findByIdAndUpdate(
			req.user._id.toString(),
			{
				$set: {
					name: userDetails.name,
					email: userDetails.email,
				},
			},
			{ new: true }
		)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'User details updated successfully',
			data: user,
		})
	})
)

router.get(
	'/removeImage',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'accountPage.profileInformation.canRemoveProfileImage',
		mobilePath: null,
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		let user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		if (user.image) {
			await deleteAwsObject(user.image)
		}

		user = await User.findByIdAndUpdate(
			req.user._id.toString(),
			{ $unset: { image: '' } },
			{ new: true }
		)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Image removed successfully',
			data: null,
		})
	})
)

router.put(
	'/updateImage',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'accountPage.profileInformation.canUpdateProfileImage',
		mobilePath: 'myProfileScreen.canUpdateProfileData',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		let imageKey = req.body.key
		if (!imageKey) {
			return next(
				new ErrorHandler('Please provide an image key.', HTTP.BAD_REQUEST)
			)
		}

		let user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		user = await User.findByIdAndUpdate(
			req.user._id.toString(),
			{ $set: { image: imageKey } },
			{ new: true }
		)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Image updated successfully',
			data: null,
		})
	})
)

router.put(
	'/change-quality',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ preferredDownloadQuality: req.body.preferredDownloadQuality },
			{ new: true }
		)

		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Quality preference updated successfully',
			data: user,
		})
	})
)

router.put(
	'/change-app-language',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'desktopHeader.canChangeAppLanguage',
		mobilePath: 'settingsScreen.canChangeAppLanguage',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { preferredAppLanguage } = req.body
		if (!preferredAppLanguage) {
			return next(
				new ErrorHandler(
					'Please provide preferred app language',
					HTTP.BAD_REQUEST
				)
			)
		}
		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ preferredAppLanguage },
			{ new: true }
		)
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}
		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'App language preference updated successfully',
			data: user,
		})
	})
)

router.get(
	'/getUserProfile',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: 'profilePage',
		mobilePath: 'userProfileScreen',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { userId } = req.query
		if (!userId) {
			return next(new ErrorHandler('User Id is required', HTTP.BAD_REQUEST))
		}
		const user = await User.findById(userId).select('-password').lean()

		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found', HTTP.BAD_REQUEST))
		}

		const badges = await UserBadges.find({ user: userId })
			.populate('badge')
			.lean()

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'User profile retrieved successfully',
			data: { user, badges },
		})
	})
)

router.get(
	'/getMyChats',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user._id
		if (!userId) {
			return next(new ErrorHandler('User Id is required', HTTP.BAD_REQUEST))
		}
		const userObjectId = new mongoose.Types.ObjectId(userId)

		const chats = await Message.aggregate([
			{
				// Match messages involving the user
				$match: { $or: [{ sender: userObjectId }, { receiver: userObjectId }] },
			},
			{
				// Sort by message creation date to get the last message in each conversation
				$sort: { createdAt: -1 },
			},
			{
				// Group by unique conversation pairs and take the actual last message
				$group: {
					_id: {
						$cond: {
							if: { $lt: ['$sender', '$receiver'] },
							then: { sender: '$sender', receiver: '$receiver' },
							else: { sender: '$receiver', receiver: '$sender' },
						},
					},
					lastMessage: { $first: '$$ROOT' },
					unreadCount: {
						$sum: {
							$cond: [
								{
									$and: [
										{ $eq: ['$receiver', userObjectId] },
										{ $eq: ['$isRead', false] },
									],
								},
								1,
								0,
							],
						},
					},
				},
			},
			{
				// Determine the actual chat user based on sender and receiver
				$addFields: {
					chatUserId: {
						$cond: {
							if: { $eq: ['$_id.sender', '$_id.receiver'] }, // Case where sender and receiver are the same
							then: '$_id.sender',
							else: {
								$cond: [
									{ $eq: ['$_id.sender', userObjectId] },
									'$_id.receiver', // If sender is the user, chat user is the receiver
									'$_id.sender', // Otherwise, chat user is the sender
								],
							},
						},
					},
				},
			},
			{
				// Lookup to get user data of the conversation partner
				$lookup: {
					from: 'users',
					localField: 'chatUserId',
					foreignField: '_id',
					as: 'user',
				},
			},
			{
				$unwind: {
					path: '$user',
					preserveNullAndEmptyArrays: true, // Preserve entries with no matching user
				},
			},
			{
				$match: {
					$or: [
						{ 'user.isDeleted': { $exists: false } },
						{ 'user.isDeleted': false },
					],
					'user.isEnabled': true,
				},
			},
			{
				$project: {
					_id: 0,
					chatUser: {
						_id: '$user._id',
						name: '$user.name',
						image: '$user.image',
					},
					lastMessage: '$lastMessage.message',
					lastMessageDate: '$lastMessage.createdAt',
					unreadCount: 1,
				},
			},
			{
				// Sort the results by the date of the last message
				$sort: { lastMessageDate: -1 },
			},
		])

		const chatsModified = await Promise.all(
			chats.map(async (chat) => {
				if (chat.chatUser) {
					return {
						...chat,
						chatUser: {
							...chat.chatUser,
							image: chat.chatUser.image
								? await generateObjectUrl(chat.chatUser.image)
								: null,
						},
					}
				} else {
					return { ...chat, chatUser: null }
				}
			})
		)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Chats retrieved successfully',
			data: chatsModified,
		})
	})
)

router.get(
	'/deleteAccount',
	clientTypeMiddleware,
	featureFlagMiddleware({
		webPath: null,
		mobilePath: 'settingsScreen.canDeleteAccount',
	}),
	[auth],
	catchAsyncError(async (req, res, next) => {
		const userId = req.user._id
		if (!userId) {
			return next(new ErrorHandler('User Id is required', HTTP.BAD_REQUEST))
		}

		await User.findByIdAndUpdate(userId, {
			isDeleted: true,
			isEnabled: false,
			deletedAt: new Date(),
		})

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Account deleted successfully',
			data: { deleted: true },
		})
	})
)

// ==========================================
// PROFILE UPDATE WITH VERIFICATION
// ==========================================

/**
 * POST /check-profile-update
 * Analyzes what fields changed and returns verification requirements
 */
router.post(
	'/check-profile-update',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { name, email, phone, phonePin } = req.body

		const user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		// Check for duplicate email if email is being changed
		if (email) {
			const newEmail = email.toLowerCase()
			const emailChanged = newEmail !== (user.email?.toLowerCase() || '')

			if (emailChanged) {
				const existingUserWithEmail = await User.findOne({
					email: newEmail,
					_id: { $ne: req.user._id.toString() },
					isDeleted: { $ne: true },
				})

				if (existingUserWithEmail) {
					return next(
						new ErrorHandler(
							'This email is already in use by another account',
							HTTP.BAD_REQUEST
						)
					)
				}
			}
		}

		// Check for duplicate phone if phone is being changed
		if (phone && phonePin) {
			const e164Phone = combineToE164ForUser(phone, phonePin)
			if (!e164Phone) {
				return next(
					new ErrorHandler('Invalid phone number format', HTTP.BAD_REQUEST)
				)
			}

			// Extract national number (digits only) for comparison
			const cleanPhone = phone.replace(/\D/g, '')
			const normalizedPin = phonePin.startsWith('+') ? phonePin : `+${phonePin}`

			// Compare with current user's phone (user.phone is national number, user.phonePin is country code)
			const phoneChanged =
				cleanPhone !== (user.phone || '') ||
				normalizedPin !== (user.phonePin || '')

			// Only check for duplicates if phone is actually changing
			if (phoneChanged) {
				const existingUserWithPhone = await User.findOne({
					phone: cleanPhone,
					phonePin: normalizedPin,
					_id: { $ne: req.user._id.toString() },
					isDeleted: { $ne: true },
				})

				if (existingUserWithPhone) {
					return next(
						new ErrorHandler(
							'This phone number is already in use by another account',
							HTTP.BAD_REQUEST
						)
					)
				}
			}
		}

		// Compare with current user data
		const cleanPhone = phone ? phone.replace(/\D/g, '') : ''
		const normalizedPin =
			phonePin && phonePin.startsWith('+')
				? phonePin
				: phonePin
					? `+${phonePin}`
					: ''

		const changedFields = {
			name: name && name.trim() !== user.name,
			email: email && email.toLowerCase() !== (user.email?.toLowerCase() || ''),
			phone:
				phone &&
				phonePin &&
				(cleanPhone !== (user.phone || '') ||
					normalizedPin !== (user.phonePin || '')),
		}

		const needsVerification = changedFields.email || changedFields.phone
		const canUpdateDirectly = changedFields.name && !needsVerification

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Profile update requirements analyzed',
			data: {
				needsVerification,
				verificationRequired: {
					email: changedFields.email,
					phone: changedFields.phone,
				},
				canUpdateDirectly,
				changedFields,
			},
		})
	})
)

/**
 * Helper function to combine phone and phonePin to E.164 format using libphonenumber-js
 * @param {string} phone - National phone number (digits only)
 * @param {string} phonePin - Country dial code (e.g., "+1")
 * @returns {string|null} - E.164 formatted phone or null if invalid
 */
function combineToE164ForUser(phone, phonePin) {
	if (!phone || !phonePin) return null

	try {
		// Clean the phone number (digits only)
		const cleanPhone = phone.replace(/\D/g, '')

		// Ensure phonePin starts with +
		const normalizedPin = phonePin.startsWith('+') ? phonePin : `+${phonePin}`

		// Combine to E.164 format
		const e164Phone = `${normalizedPin}${cleanPhone}`

		// Check if this is a test phone number - skip validation
		const testPhones =
			process.env.TEST_PHONE_NUMBERS?.split(',').map((p) => p.trim()) || []
		if (testPhones.includes(e164Phone)) {
			return e164Phone
		}

		// Use libphonenumber-js to validate and format
		const phoneNumber = parsePhoneNumberWithError(e164Phone)

		if (phoneNumber && phoneNumber.isValid()) {
			return phoneNumber.format('E.164')
		}

		return null
	} catch (error) {
		// If parsing fails, return null
		return null
	}
}

/**
 * POST /send-email-verification
 * Sends OTP to new email address for profile update
 */
router.post(
	'/send-email-verification',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { email } = req.body

		if (!email) {
			return next(new ErrorHandler('Email is required', HTTP.BAD_REQUEST))
		}

		const user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		// Generate verification ID
		const verificationId = uuidv4()

		// Create pseudo-user for OTP tracking
		const pseudoUser = {
			_id: verificationId,
			email: email.toLowerCase(),
		}

		// Use createAndSendOTP service
		const otpResult = await createAndSendOTP(pseudoUser, 'email', null, false)

		if (!otpResult.success) {
			return next(
				new ErrorHandler(otpResult.message, HTTP.TOO_MANY_REQUESTS, {
					cooldownRemaining: otpResult.cooldownRemaining,
					limitExceeded: otpResult.limitExceeded || false,
					remainingSeconds: otpResult.remainingSeconds,
					resetTime: otpResult.resetTime,
					remainingRequests: otpResult.remainingRequests || 0,
				})
			)
		}

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'OTP sent to email',
			data: {
				verificationId,
				contactMethod: 'email',
				cooldownRemaining: otpResult.cooldownRemaining || 60,
				remainingRequests: otpResult.remainingRequests,
			},
		})
	})
)

/**
 * POST /verify-email-otp
 * Verifies OTP for email change
 */
router.post(
	'/verify-email-otp',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { verificationId, otp, email } = req.body

		if (!verificationId || !otp || !email) {
			return next(
				new ErrorHandler(
					'Verification ID, OTP, and email are required',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Create pseudo-user for OTP verification
		const pseudoUser = {
			_id: verificationId,
			email: email.toLowerCase(),
		}

		// Use verifyOTP service
		const verificationResult = await verifyOTP(pseudoUser, otp)

		if (!verificationResult.success) {
			return next(
				new ErrorHandler(verificationResult.message, HTTP.BAD_REQUEST)
			)
		}

		// Store verification token in a temporary token model or session
		// For now, we'll return a verification token that will be validated in update-profile
		const verificationToken = crypto.randomBytes(32).toString('hex')

		// Store in Token model with expiration (10 minutes)
		await Token.create({
			token: verificationToken,
			userId: req.user._id.toString(),
			type: 'email-verification',
			metadata: { email: email.toLowerCase() },
			expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
		})

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Email verified successfully',
			data: {
				verificationToken,
				email: email.toLowerCase(),
			},
		})
	})
)

/**
 * POST /send-phone-verification
 * Sends OTP to new phone number for profile update
 */
router.post(
	'/send-phone-verification',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { phone, phonePin } = req.body

		if (!phone || !phonePin) {
			return next(
				new ErrorHandler('Phone and phonePin are required', HTTP.BAD_REQUEST)
			)
		}

		const e164Phone = combineToE164ForUser(phone, phonePin)
		if (!e164Phone) {
			return next(
				new ErrorHandler('Invalid phone number format', HTTP.BAD_REQUEST)
			)
		}

		const user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		// Generate verification ID
		const verificationId = uuidv4()

		// Check if this is a test phone number (compare E.164 format)
		const isTestPhone =
			e164Phone &&
			process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

		// For test phones, skip OTP sending
		if (isTestPhone) {
			return sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: `Test phone detected. Use ${TEST_OTP} as OTP.`,
				data: {
					verificationId,
					contactMethod: 'phone',
					cooldownRemaining: 0,
					remainingRequests: 999,
					limitExceeded: false,
				},
			})
		}

		// Create pseudo-user for OTP tracking
		const pseudoUser = {
			_id: verificationId,
			phone: e164Phone,
		}

		// Use createAndSendOTP service
		const otpResult = await createAndSendOTP(pseudoUser, 'phone', null, false)

		if (!otpResult.success) {
			return next(
				new ErrorHandler(otpResult.message, HTTP.TOO_MANY_REQUESTS, {
					cooldownRemaining: otpResult.cooldownRemaining,
					limitExceeded: otpResult.limitExceeded || false,
					remainingSeconds: otpResult.remainingSeconds,
					resetTime: otpResult.resetTime,
					remainingRequests: otpResult.remainingRequests || 0,
				})
			)
		}

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'OTP sent to phone',
			data: {
				verificationId,
				contactMethod: 'phone',
				cooldownRemaining: otpResult.cooldownRemaining || 60,
				remainingRequests: otpResult.remainingRequests,
			},
		})
	})
)

/**
 * POST /verify-phone-otp
 * Verifies OTP for phone change
 */
router.post(
	'/verify-phone-otp',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { verificationId, otp, phone, phonePin } = req.body

		if (!verificationId || !otp || !phone || !phonePin) {
			return next(
				new ErrorHandler(
					'Verification ID, OTP, phone, and phonePin are required',
					HTTP.BAD_REQUEST
				)
			)
		}

		const e164Phone = combineToE164ForUser(phone, phonePin)
		if (!e164Phone) {
			return next(
				new ErrorHandler('Invalid phone number format', HTTP.BAD_REQUEST)
			)
		}

		// Check if this is a test phone number
		const isTestPhone =
			e164Phone &&
			process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

		if (isTestPhone && otp === TEST_OTP) {
			// Allow test OTP - skip verification
		} else {
			// Create pseudo-user for OTP verification
			const pseudoUser = {
				_id: verificationId,
				phone: e164Phone,
			}

			// Use verifyOTP service
			const verificationResult = await verifyOTP(pseudoUser, otp)

			if (!verificationResult.success) {
				return next(
					new ErrorHandler(verificationResult.message, HTTP.BAD_REQUEST)
				)
			}
		}

		// Store verification token
		const verificationToken = crypto.randomBytes(32).toString('hex')

		// Store in Token model with expiration (10 minutes)
		await Token.create({
			token: verificationToken,
			userId: req.user._id.toString(),
			type: 'phone-verification',
			metadata: {
				phone: e164Phone,
				phonePin,
				phoneNumber: phone.replace(/\D/g, ''),
			},
			expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
		})

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Phone verified successfully',
			data: {
				verificationToken,
				phone: e164Phone,
			},
		})
	})
)

/**
 * PUT /update-profile
 * Final profile update after all verifications pass
 */
router.put(
	'/update-profile',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const {
			name,
			email,
			phone,
			phonePin,
			emailVerificationToken,
			phoneVerificationToken,
		} = req.body

		const user = await User.findById(req.user._id.toString())
		if (!user || user.isDeleted) {
			return next(new ErrorHandler('User not found!', HTTP.NOT_FOUND))
		}

		const updateData = {}
		if (name) updateData.name = name.trim()

		// Only require verification token if email is being changed
		if (email) {
			// Check if email is actually changing
			const userEmail = user.email?.toLowerCase() || ''
			const newEmail = email.toLowerCase()
			const emailChanged = userEmail !== newEmail

			if (emailChanged) {
				// Check for duplicate email
				const existingUserWithEmail = await User.findOne({
					email: newEmail,
					_id: { $ne: req.user._id.toString() },
					isDeleted: { $ne: true },
				})

				if (existingUserWithEmail) {
					return next(
						new ErrorHandler(
							'This email is already in use by another account',
							HTTP.BAD_REQUEST
						)
					)
				}

				if (!emailVerificationToken) {
					return next(
						new ErrorHandler(
							'Email verification token is required',
							HTTP.BAD_REQUEST
						)
					)
				}

				// Only validate token if email changed
				const emailToken = await Token.findOne({
					token: emailVerificationToken,
					userId: req.user._id.toString(),
					type: 'email-verification',
					expiresAt: { $gt: new Date() },
				})

				if (!emailToken) {
					return next(
						new ErrorHandler(
							'Invalid or expired email verification token',
							HTTP.BAD_REQUEST
						)
					)
				}

				// Verify the email matches
				if (emailToken.metadata?.email !== email.toLowerCase()) {
					return next(
						new ErrorHandler(
							'Email does not match verification',
							HTTP.BAD_REQUEST
						)
					)
				}

				updateData.email = email.toLowerCase()
				updateData.emailVerifiedAt = new Date()

				// Delete the token after use
				await Token.deleteOne({ _id: emailToken._id })
			}
			// If email not changed, don't update email field
		}

		// Only require verification token if phone is being changed
		if (phone && phonePin) {
			const e164Phone = combineToE164ForUser(phone, phonePin)
			if (!e164Phone) {
				return next(
					new ErrorHandler('Invalid phone number format', HTTP.BAD_REQUEST)
				)
			}

			// Extract national number and country code for comparison
			const cleanPhone = phone.replace(/\D/g, '')
			const normalizedPin = phonePin.startsWith('+') ? phonePin : `+${phonePin}`

			// Check if phone is actually changing (compare national number and country code separately)
			const userPhone = user.phone || ''
			const userPhonePin = user.phonePin || ''
			const phoneChanged =
				cleanPhone !== userPhone || normalizedPin !== userPhonePin

			if (phoneChanged && !phoneVerificationToken) {
				return next(
					new ErrorHandler(
						'Phone verification token is required',
						HTTP.BAD_REQUEST
					)
				)
			}

			// Only validate token if phone changed
			if (phoneChanged) {
				// Check for duplicate phone before updating
				const existingUserWithPhone = await User.findOne({
					phone: cleanPhone,
					phonePin: normalizedPin,
					_id: { $ne: req.user._id.toString() },
					isDeleted: { $ne: true },
				})

				if (existingUserWithPhone) {
					return next(
						new ErrorHandler(
							'This phone number is already in use by another account',
							HTTP.BAD_REQUEST
						)
					)
				}

				if (!phoneVerificationToken) {
					return next(
						new ErrorHandler(
							'Phone verification token is required',
							HTTP.BAD_REQUEST
						)
					)
				}

				const phoneToken = await Token.findOne({
					token: phoneVerificationToken,
					userId: req.user._id.toString(),
					type: 'phone-verification',
					expiresAt: { $gt: new Date() },
				})

				if (!phoneToken) {
					return next(
						new ErrorHandler(
							'Invalid or expired phone verification token',
							HTTP.BAD_REQUEST
						)
					)
				}

				// Verify the phone matches (metadata stores E.164, but we need to compare)
				const verifiedE164Phone = phoneToken.metadata?.phone
				if (verifiedE164Phone !== e164Phone) {
					return next(
						new ErrorHandler(
							'Phone does not match verification',
							HTTP.BAD_REQUEST
						)
					)
				}

				// Store phone as national number (digits only) and phonePin as country code
				// phone field should store only digits (national number), not E.164 format
				updateData.phone = cleanPhone
				updateData.phonePin = normalizedPin
				updateData.phoneVerifiedAt = new Date()

				// Delete the token after use
				await Token.deleteOne({ _id: phoneToken._id })
			} else {
				// Phone not changed, just update name if provided
				// Don't update phone field
			}
		}

		// Update user atomically
		const updatedUser = await User.findByIdAndUpdate(
			req.user._id.toString(),
			{ $set: updateData },
			{ new: true }
		).select('-password')

		return sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Profile updated successfully',
			data: updatedUser,
		})
	})
)

module.exports = router
