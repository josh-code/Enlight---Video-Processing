const express = require('express')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const UAParser = require('ua-parser-js')
const { parsePhoneNumberWithError } = require('libphonenumber-js')
const router = express.Router()
const { User, validateSignup } = require('../../../models/app/user_model')
const { OAuthAccount } = require('../../../models/app/oauth_account_model')
const { AuthSession } = require('../../../models/app/auth_session_model')
const Token = require('../../../models/common/token_model')
const { verifyPhoneNumber } = require('../../../services/twillio')
const auth = require('../../../middleware/auth')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const {
	createAndSendOTP,
	verifyOTP,
	checkCooldown,
	checkRequestLimit,
} = require('../../../services/otp')
const {
	sendNotificationToUser,
} = require('../../../services/expoPushNotification')
const clientTypeMiddleware = require('../../../middleware/clientTypeMiddleware')
const { verifyTurnstileToken } = require('../../../services/turnstile')
const {
	verifyGoogleIdToken,
	getGoogleClientId,
} = require('../../../services/googleOAuth')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')

// ==========================================
// CONSTANTS
// ==========================================

const TEST_OTP = '123456' // OTP for test phone numbers

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Combine phone and phonePin into E.164 format for SMS services
 * @param {string} phone - National phone number (digits only)
 * @param {string} phonePin - Country dial code (e.g., "+1")
 * @returns {string|null} - E.164 formatted phone or null if invalid
 */
function combineToE164(phone, phonePin) {
	if (!phone || !phonePin) return null

	// Clean the phone number (digits only)
	const cleanPhone = phone.replace(/\D/g, '')

	// Ensure phonePin starts with +
	const normalizedPin = phonePin.startsWith('+') ? phonePin : `+${phonePin}`

	// Combine and validate
	const e164 = `${normalizedPin}${cleanPhone}`
	const e164Pattern = /^\+[1-9]\d{1,14}$/

	if (e164Pattern.test(e164)) {
		return e164
	}
	return null
}

/**
 * Parse E.164 phone number into phone and phonePin
 * @param {string} e164Phone - Phone in E.164 format (e.g., "+14155552671")
 * @returns {{ phone: string, phonePin: string } | null} - Parsed phone components or null
 */
function parseE164ToComponents(e164Phone) {
	if (!e164Phone || !e164Phone.startsWith('+')) return null

	try {
		const parsed = parsePhoneNumberWithError(e164Phone)

		if (parsed && parsed.isValid()) {
			return {
				phone: parsed.nationalNumber,
				phonePin: `+${parsed.countryCallingCode}`,
			}
		}
	} catch (e) {
		// Invalid phone format
	}
	return null
}

/**
 * Generate device ID and platform info from request
 */
function generateDeviceId(req) {
	const userAgent = req.headers['user-agent'] || 'Unknown'

	// Check for mobile app custom headers
	const isMobileApp = req.headers['x-client-type'] === 'mobile'

	if (isMobileApp) {
		// Use custom headers from mobile app
		const deviceId = req.headers['x-device-id'] || crypto.randomUUID()
		const deviceName = req.headers['x-device-name'] || 'Mobile Device'
		const deviceModel = req.headers['x-device-model'] || 'Unknown'
		const osName = req.headers['x-os-name'] || 'Unknown'
		const osVersion = req.headers['x-os-version'] || ''

		return {
			deviceId,
			deviceType: 'mobile',
			deviceName: deviceName || deviceModel,
			platform: {
				os: { name: osName, version: osVersion },
				browser: null,
				app: {
					name: req.headers['x-app-name'] || 'Mobile App',
					version: req.headers['x-app-version'] || '1.0.0',
					buildNumber: req.headers['x-app-build'] || '',
				},
			},
		}
	}

	// Check for web client custom headers (from Next.js server actions)
	const isWebClient = req.headers['x-client-type'] === 'web'
	const hasWebDeviceInfo =
		req.headers['x-browser-name'] || req.headers['x-os-name']

	if (isWebClient && hasWebDeviceInfo) {
		// Use custom headers from web client
		const browserName = req.headers['x-browser-name'] || 'Unknown'
		const browserVersion = req.headers['x-browser-version'] || ''
		const osName = req.headers['x-os-name'] || 'Unknown'
		const osVersion = req.headers['x-os-version'] || ''
		const deviceType = req.headers['x-device-type'] || 'web'

		const deviceName = `${browserName}${browserVersion ? ` ${browserVersion}` : ''} on ${osName}${osVersion ? ` ${osVersion}` : ''}`

		// Generate device ID from device info
		const rawDeviceString = `${deviceType}-${browserName}-${browserVersion}-${osName}-${osVersion}`
		const deviceId = crypto
			.createHash('sha256')
			.update(rawDeviceString)
			.digest('hex')

		return {
			deviceId,
			deviceType,
			deviceName,
			platform: {
				os: { name: osName, version: osVersion },
				browser: {
					name: browserName,
					version: browserVersion,
				},
				app: null,
			},
		}
	}

	// Fallback: Parse user agent for web browsers
	const parser = new UAParser(userAgent)
	const os = parser.getOS()
	const browser = parser.getBrowser()
	const device = parser.getDevice()

	const deviceType = device.type || 'web'
	const deviceName = `${browser.name || 'Unknown Browser'} on ${
		os.name || 'Unknown OS'
	}`

	// Generate device ID from user agent hash
	const rawDeviceString = `${deviceType}-${browser.name}-${browser.version}-${os.name}-${os.version}`
	const deviceId = crypto
		.createHash('sha256')
		.update(rawDeviceString)
		.digest('hex')

	return {
		deviceId,
		deviceType,
		deviceName,
		platform: {
			os: { name: os.name || 'Unknown', version: os.version || '' },
			browser: {
				name: browser.name || 'Unknown',
				version: browser.version || '',
			},
			app: null,
		},
	}
}

/**
 * Register a new session for a user
 */
async function registerSession({
	userId,
	deviceId,
	deviceType,
	deviceName,
	token,
	platform,
}) {
	// Create or update session
	const session = await AuthSession.upsertSession({
		userId,
		deviceId,
		token,
		deviceType,
		deviceName,
		platform,
	})

	return session
}

/**
 * Get active sessions for a user
 */
async function getActiveSessions(userId) {
	return AuthSession.getActiveSessions(userId)
}

/**
 * Logout all sessions except the specified device
 */
async function logoutAllSessionsExcept(userId, exceptDeviceId) {
	return AuthSession.invalidateAllExcept(userId, exceptDeviceId)
}

/**
 * Shared helper function for resending OTP
 * Used by signup, login, and forgot-password resend endpoints
 * @param {Object} params - Parameters for resending OTP
 * @param {string} params.verificationId - The verification ID for OTP tracking
 * @param {string} [params.email] - Email address
 * @param {string} [params.phone] - National phone number (digits only)
 * @param {string} [params.phonePin] - Country dial code (e.g., "+1")
 * @param {string} [params.contactMethod] - 'email' or 'phone'
 * @param {Object} params.emailTemplate - Email template options
 * @param {string} params.emailTemplate.subject - Email subject
 * @param {string} params.emailTemplate.template - Email template name
 * @returns {Object} - Result with success status, message, and data
 * @throws {ErrorHandler} - For validation or rate limit errors
 */
async function handleResendOtp({
	verificationId,
	email,
	phone,
	phonePin,
	contactMethod,
	emailTemplate,
}) {
	if (!verificationId) {
		throw new ErrorHandler('Verification ID is required.', HTTP.BAD_REQUEST)
	}

	if (!email && !phone) {
		throw new ErrorHandler('Email or phone is required.', HTTP.BAD_REQUEST)
	}

	const method = contactMethod || (email ? 'email' : 'phone')

	// Combine phone and phonePin to E.164 for SMS sending
	let e164Phone = null
	if (phone && method === 'phone') {
		if (!phonePin) {
			throw new ErrorHandler(
				'Country code (phonePin) is required when using phone.',
				HTTP.BAD_REQUEST
			)
		}
		e164Phone = combineToE164(phone, phonePin)
		if (!e164Phone) {
			throw new ErrorHandler(
				'Invalid phone number or country code format.',
				HTTP.BAD_REQUEST
			)
		}
	}

	// Check if this is a test phone number (compare E.164 format)
	const isTestPhone =
		method === 'phone' &&
		e164Phone &&
		process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

	// For test phones, skip OTP sending
	if (isTestPhone) {
		return {
			success: true,
			message: `Test phone detected. Use ${TEST_OTP} as OTP.`,
			data: {
				verificationId,
				contactMethod: method,
				cooldownRemaining: 0,
				remainingRequests: 999,
				limitExceeded: false,
			},
		}
	}

	// Create pseudo-user for OTP tracking (use E.164 for SMS sending)
	const pseudoUser = {
		_id: verificationId,
		email: email?.toLowerCase(),
		phone: e164Phone, // E.164 format for SMS service
	}

	// Use createAndSendOTP which handles cooldown and rate limit
	const otpResult = await createAndSendOTP(
		pseudoUser,
		method,
		emailTemplate,
		false // Don't skip cooldown
	)

	if (!otpResult.success) {
		throw new ErrorHandler(otpResult.message, HTTP.TOO_MANY_REQUESTS, {
			cooldownRemaining: otpResult.cooldownRemaining,
			limitExceeded: otpResult.limitExceeded || false,
			remainingSeconds: otpResult.remainingSeconds,
			resetTime: otpResult.resetTime,
			remainingRequests: otpResult.remainingRequests || 0,
		})
	}

	return {
		success: true,
		message: `OTP resent to your ${method}`,
		data: {
			verificationId,
			contactMethod: method,
			cooldownRemaining: otpResult.cooldownRemaining || 60,
			remainingRequests: otpResult.remainingRequests,
			limitExceeded: false,
		},
	}
}

// ==========================================
// NEW PASSWORD-BASED AUTH ENDPOINTS
// ==========================================

/**
 * POST /signup
 * Password-based signup - sends OTP to email or phone
 */
router.post(
	'/signup',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const {
			name,
			email,
			phone, // National phone number (digits only)
			phonePin, // Country dial code (e.g., "+1")
			password,
			contactMethod, // 'email' or 'phone'
			preferredAppLanguage,
			timeZone,
			turnstileToken,
			verificationId: existingVerificationId, // For resend scenario
		} = req.body

		// Validate required fields
		if (!password) {
			return next(new ErrorHandler('Password is required.', HTTP.BAD_REQUEST))
		}

		if (!name) {
			return next(new ErrorHandler('Name is required.', HTTP.BAD_REQUEST))
		}

		if (!email && !phone) {
			return next(
				new ErrorHandler('Email or phone is required.', HTTP.BAD_REQUEST)
			)
		}

		// Determine contact method
		const method = contactMethod || (email ? 'email' : 'phone')

		// Validate phone and phonePin if using phone method
		let e164Phone = null
		if (phone && method === 'phone') {
			if (!phonePin) {
				return next(
					new ErrorHandler(
						'Country code (phonePin) is required when using phone.',
						HTTP.BAD_REQUEST
					)
				)
			}
			e164Phone = combineToE164(phone, phonePin)
			if (!e164Phone) {
				return next(
					new ErrorHandler(
						'Invalid phone number or country code format.',
						HTTP.BAD_REQUEST
					)
				)
			}
		}

		// Captcha verification for web
		// const isMobileApp = req.clientType === "mobile";
		// if (!isMobileApp && turnstileToken) {
		//   const requestIp =
		//     req.headers["cf-connecting-ip"] ||
		//     req.headers["x-real-ip"] ||
		//     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
		//     req.ip;

		//   const captchaResult = await verifyTurnstileToken(
		//     turnstileToken,
		//     requestIp
		//   );
		//   if (!captchaResult.success) {
		//     return next(
		//       new ErrorHandler(
		//         captchaResult.message || "Captcha verification failed.",
		//         HTTP.BAD_REQUEST,
		//         { error: "captcha_failed" }
		//       )
		//     );
		//   }
		// }

		// Check if user already exists (by email or phone)
		const conditions = []
		if (email)
			conditions.push({ email: email.toLowerCase(), isDeleted: { $ne: true } })
		if (phone)
			conditions.push({
				phone: phone.replace(/\D/g, ''), // Clean phone for comparison
				isDeleted: { $ne: true },
			})

		const existingUser = await User.findOne({ $or: conditions })
		if (existingUser) {
			return next(
				new ErrorHandler(
					'An account already exists with this email or phone.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate signup data
		const signupData = {
			name,
			email: email?.toLowerCase(),
			phone: phone ? phone.replace(/\D/g, '') : undefined, // Store only digits
			phonePin: phone ? phonePin : undefined,
			password,
			preferredAppLanguage,
			timeZone,
		}

		const validation = validateSignup(signupData)
		if (validation.error) {
			return next(
				new ErrorHandler(validation.error.details[0].message, HTTP.BAD_REQUEST)
			)
		}

		// Verify phone number format if using phone (use E.164 for verification service)
		if (method === 'phone' && e164Phone) {
			const phoneVerification = await verifyPhoneNumber(e164Phone)
			if (!phoneVerification.success) {
				return next(
					new ErrorHandler(phoneVerification.message, HTTP.BAD_REQUEST)
				)
			}
		}

		// Use existing verification ID or generate new one
		const verificationId = existingVerificationId || uuidv4()

		// Check if this is a test phone number (compare E.164 format)
		const isTestPhone =
			method === 'phone' &&
			e164Phone &&
			process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

		// For test phones, skip OTP sending
		if (isTestPhone) {
			sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: `Test phone detected. Use ${TEST_OTP} as OTP.`,
				data: {
					verificationId,
					contactMethod: method,
					cooldownRemaining: 0,
					remainingRequests: 999,
				},
			})
			return
		}

		// Check cooldown (for resend scenarios)
		const cooldownCheck = await checkCooldown(verificationId)
		if (!cooldownCheck.canResend) {
			return next(
				new ErrorHandler(
					`Please wait ${cooldownCheck.remainingSeconds} seconds before requesting a new OTP.`,
					HTTP.TOO_MANY_REQUESTS,
					{
						error: 'cooldown',
						cooldownRemaining: cooldownCheck.remainingSeconds,
					}
				)
			)
		}

		// Check request limit
		const limitCheck = await checkRequestLimit(verificationId)
		if (!limitCheck.withinLimit) {
			return next(
				new ErrorHandler(limitCheck.message, HTTP.TOO_MANY_REQUESTS, {
					error: 'rate_limit',
					remainingSeconds: limitCheck.remainingSeconds,
					resetTime: limitCheck.resetTime,
				})
			)
		}

		// Create pseudo-user for OTP tracking (use E.164 for SMS sending)
		const pseudoUser = {
			_id: verificationId,
			email: email?.toLowerCase(),
			phone: e164Phone, // E.164 format for SMS service
		}

		// Use createAndSendOTP with skipCooldown=true (already checked above)
		const otpResult = await createAndSendOTP(
			pseudoUser,
			method,
			{
				subject: 'Verify your email - Church Planting Institute',
				template: 'sign-up-otp-email',
			},
			true // skipCooldown since we already checked
		)

		if (!otpResult.success) {
			return next(
				new ErrorHandler(
					otpResult.message || 'Failed to send OTP',
					HTTP.BAD_REQUEST,
					{
						cooldownRemaining: otpResult.cooldownRemaining,
						limitExceeded: otpResult.limitExceeded,
						remainingSeconds: otpResult.remainingSeconds,
					}
				)
			)
		}

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: `OTP sent to your ${method}`,
			data: {
				verificationId,
				contactMethod: method,
				cooldownRemaining: otpResult.cooldownRemaining || 60,
				remainingRequests: otpResult.remainingRequests,
			},
		})
	})
)

/**
 * POST /resend-signup-otp
 * Resend OTP for signup verification
 */
router.post(
	'/resend-signup-otp',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		try {
			const { verificationId, email, phone, phonePin, contactMethod } = req.body

			const result = await handleResendOtp({
				verificationId,
				email,
				phone,
				phonePin,
				contactMethod,
				emailTemplate: {
					subject: 'Verify your email - Church Planting Institute',
					template: 'sign-up-otp-email',
				},
			})

			sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: result.message,
				data: result.data,
			})
		} catch (error) {
			next(error)
		}
	})
)

/**
 * POST /resend-login-otp
 * Resend OTP for login verification
 */
router.post(
	'/resend-login-otp',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		try {
			const { verificationId, email, phone, phonePin, contactMethod } = req.body

			const result = await handleResendOtp({
				verificationId,
				email,
				phone,
				phonePin,
				contactMethod,
				emailTemplate: {
					subject: 'Your login code - Church Planting Institute',
					template: 'login-otp-email',
				},
			})

			sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: result.message,
				data: result.data,
			})
		} catch (error) {
			next(error)
		}
	})
)

/**
 * POST /resend-forgot-password-otp
 * Resend OTP for forgot password verification
 */
router.post(
	'/resend-forgot-password-otp',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		try {
			console.log('req.body', req.body)
			const { verificationId, email, phone, phonePin, contactMethod } = req.body

			const result = await handleResendOtp({
				verificationId,
				email,
				phone,
				phonePin,
				contactMethod,
				emailTemplate: {
					subject: 'Reset your password - Church Planting Institute',
					template: 'forgot-password-otp-email',
				},
			})

			sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: result.message,
				data: result.data,
			})
		} catch (error) {
			next(error)
		}
	})
)

/**
 * POST /forgot-password
 * Initiate forgot password flow - sends OTP to email or phone
 */
router.post(
	'/forgot-password',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const { emailOrPhone } = req.body

		if (!emailOrPhone) {
			return next(
				new ErrorHandler('Email or phone is required.', HTTP.BAD_REQUEST)
			)
		}

		// Detect if input is email or phone
		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		const isEmailFormat = emailPattern.test(emailOrPhone)
		const contactMethod = isEmailFormat ? 'email' : 'phone'

		// Find user based on detected type
		let user
		let e164Phone = null

		if (isEmailFormat) {
			// Search by email
			user = await User.findOne({
				email: emailOrPhone.toLowerCase(),
				$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
			})
		} else {
			// Phone number - support both formats:
			// 1. With country code (E.164): "+14155552671"
			// 2. Without country code: "4155552671"

			if (emailOrPhone.startsWith('+')) {
				// User provided E.164 format - parse and match
				const parsed = parseE164ToComponents(emailOrPhone)
				if (parsed) {
					user = await User.findOne({
						phone: parsed.phone,
						phonePin: parsed.phonePin,
						$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
					})
					if (user) {
						e164Phone = emailOrPhone
					}
				}
			}

			// If no match with E.164 or no country code provided, try matching phone only
			if (!user) {
				const cleanPhone = emailOrPhone.replace(/\D/g, '')

				if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
					user = await User.findOne({
						phone: cleanPhone,
						$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
					})

					// If found, combine with user's phonePin to create E.164
					if (user && user.phonePin) {
						e164Phone = combineToE164(user.phone, user.phonePin)
					}
				}
			}
		}

		// Generate verification ID regardless of whether user exists (security)
		const verificationId = uuidv4()

		// If user not found, return success but don't send OTP (security - don't reveal if user exists)
		if (!user) {
			sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: `If an account exists with this ${contactMethod}, you will receive a verification code.`,
				data: {
					verificationId,
					contactMethod,
					cooldownRemaining: 60,
					remainingRequests: 3,
				},
			})
			return
		}

		// Check if this is a test phone number
		const isTestPhone =
			contactMethod === 'phone' &&
			e164Phone &&
			process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

		// For test phones, skip OTP sending
		if (isTestPhone) {
			sendResponse({
				res,
				code: HTTP.OK,
				status: true,
				message: `Test phone detected. Use ${TEST_OTP} as OTP.`,
				data: {
					verificationId,
					contactMethod,
					cooldownRemaining: 0,
					remainingRequests: 999,
				},
			})
			return
		}

		// Create pseudo-user for OTP tracking
		const pseudoUser = {
			_id: verificationId,
			email: isEmailFormat ? emailOrPhone.toLowerCase() : undefined,
			phone: e164Phone, // E.164 format for SMS service
		}

		// Send OTP
		const otpResult = await createAndSendOTP(
			pseudoUser,
			contactMethod,
			{
				subject: 'Reset your password - Church Planting Institute',
				template: 'forgot-password-otp-email',
			},
			false
		)

		if (!otpResult.success) {
			return next(
				new ErrorHandler(
					otpResult.message || 'Failed to send OTP',
					HTTP.TOO_MANY_REQUESTS,
					{
						cooldownRemaining: otpResult.cooldownRemaining,
						limitExceeded: otpResult.limitExceeded,
						remainingSeconds: otpResult.remainingSeconds,
					}
				)
			)
		}

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: `If an account exists with this ${contactMethod}, you will receive a verification code.`,
			data: {
				verificationId,
				contactMethod,
				cooldownRemaining: otpResult.cooldownRemaining || 60,
				remainingRequests: otpResult.remainingRequests,
				// Include phonePin and phone for resend functionality (only for phone method)
				...(contactMethod === 'phone' &&
					user &&
					user.phonePin && {
						phone: user.phone,
						phonePin: user.phonePin,
					}),
			},
		})
	})
)

/**
 * POST /verify-forgot-password-otp
 * Verify OTP and create password reset token
 */
router.post(
	'/verify-forgot-password-otp',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const { verificationId, otp, emailOrPhone } = req.body

		if (!verificationId || !otp || !emailOrPhone) {
			return next(
				new ErrorHandler(
					'Verification ID, OTP, and email/phone are required.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Detect if input is email or phone
		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		const isEmailFormat = emailPattern.test(emailOrPhone)

		// Find user
		let user
		let e164Phone = null

		if (isEmailFormat) {
			user = await User.findOne({
				email: emailOrPhone.toLowerCase(),
				$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
			})
		} else {
			if (emailOrPhone.startsWith('+')) {
				const parsed = parseE164ToComponents(emailOrPhone)
				if (parsed) {
					user = await User.findOne({
						phone: parsed.phone,
						phonePin: parsed.phonePin,
						$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
					})
					if (user) {
						e164Phone = emailOrPhone
					}
				}
			}

			if (!user) {
				const cleanPhone = emailOrPhone.replace(/\D/g, '')
				if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
					user = await User.findOne({
						phone: cleanPhone,
						$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
					})
					if (user && user.phonePin) {
						e164Phone = combineToE164(user.phone, user.phonePin)
					}
				}
			}
		}

		if (!user) {
			return next(
				new ErrorHandler('Invalid verification request.', HTTP.BAD_REQUEST)
			)
		}

		// Check if this is a test phone number
		const isTestPhone =
			!isEmailFormat &&
			e164Phone &&
			process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

		if (isTestPhone && otp === TEST_OTP) {
			// Allow test OTP - skip verification
		} else {
			// Verify OTP
			const pseudoUser = { _id: verificationId }
			const otpVerification = await verifyOTP(pseudoUser, otp)

			if (!otpVerification.success) {
				return next(
					new ErrorHandler(
						otpVerification.message === 'code expired'
							? 'OTP has expired. Please request a new one.'
							: 'Invalid OTP.',
						HTTP.BAD_REQUEST
					)
				)
			}
		}

		// Create password reset token
		const resetToken = await Token.createPasswordResetToken(user._id, 1) // 1 hour expiry

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'OTP verified successfully',
			data: {
				resetToken: resetToken.token,
			},
		})
	})
)

/**
 * POST /reset-password
 * Reset password using reset token
 */
router.post(
	'/reset-password',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const { resetToken, newPassword } = req.body

		if (!resetToken || !newPassword) {
			return next(
				new ErrorHandler(
					'Reset token and new password are required.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate password strength
		if (newPassword.length < 8) {
			return next(
				new ErrorHandler(
					'Password must be at least 8 characters long.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Find and validate token
		const token = await Token.findAndValidate(resetToken, 'password_reset')

		if (!token) {
			return next(
				new ErrorHandler(
					'Invalid or expired reset token. Please request a new one.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Check if token is already used
		if (token.isUsed) {
			return next(
				new ErrorHandler(
					'This reset link has already been used. Please request a new one.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Find user
		const user = await User.findById(token.userId)

		if (!user) {
			return next(new ErrorHandler('User not found.', HTTP.NOT_FOUND))
		}

		// Hash new password
		const salt = await bcrypt.genSalt(10)
		const hashedPassword = await bcrypt.hash(newPassword, salt)

		// Update user's password
		user.password = hashedPassword
		await user.save()

		// Mark token as used
		await token.markAsUsed(user._id)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message:
				'Password reset successfully. You can now log in with your new password.',
			data: null,
		})
	})
)

/**
 * POST /verify-signup
 * Verify OTP and complete signup with password
 */
router.post(
	'/verify-signup',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const { verificationId, otp, signupData } = req.body

		if (!verificationId || !otp || !signupData) {
			return next(
				new ErrorHandler(
					'Verification ID, OTP, and signup data are required.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate phone and phonePin if provided
		let e164Phone = null
		let cleanPhone = null
		if (signupData.phone) {
			if (!signupData.phonePin) {
				return next(
					new ErrorHandler(
						'Country code (phonePin) is required when using phone.',
						HTTP.BAD_REQUEST
					)
				)
			}
			cleanPhone = signupData.phone.replace(/\D/g, '')
			e164Phone = combineToE164(cleanPhone, signupData.phonePin)
			if (!e164Phone) {
				return next(
					new ErrorHandler(
						'Invalid phone number or country code format.',
						HTTP.BAD_REQUEST
					)
				)
			}
		}

		// Handle test phone numbers (compare E.164 format)
		const isTestPhone =
			e164Phone &&
			process.env.TEST_PHONE_NUMBERS?.split(',').includes(e164Phone)

		if (isTestPhone && otp === TEST_OTP) {
			// Allow test OTP - skip verification
		} else {
			// Create pseudo-user for OTP verification
			const pseudoUser = { _id: verificationId }

			// Use verifyOTP from otp.js which handles validation and request history preservation
			const otpVerification = await verifyOTP(pseudoUser, otp)

			if (!otpVerification.success) {
				return next(
					new ErrorHandler(
						otpVerification.message === 'code expired'
							? 'OTP has expired. Please request a new one.'
							: 'Invalid OTP.',
						HTTP.BAD_REQUEST
					)
				)
			}
		}

		// Prepare signup data with clean phone (digits only)
		// Only include fields based on contact method (email or phone)
		const dataToValidate = {
			name: signupData.name,
			password: signupData.password,
			preferredAppLanguage: signupData.preferredAppLanguage,
			timeZone: signupData.timeZone,
		}

		// Only add email if it has a value (for email method)
		if (signupData.email) {
			dataToValidate.email = signupData.email.toLowerCase()
		}

		// Only add phone and phonePin if they have actual values (for phone method)
		if (cleanPhone) {
			dataToValidate.phone = cleanPhone
		}
		if (signupData.phonePin) {
			dataToValidate.phonePin = signupData.phonePin
		}

		// Validate signup data
		const validation = validateSignup(dataToValidate)
		if (validation.error) {
			return next(
				new ErrorHandler(validation.error.details[0].message, HTTP.BAD_REQUEST)
			)
		}

		// Check if user already exists (double check)
		const conditions = []
		if (signupData.email)
			conditions.push({
				email: signupData.email.toLowerCase(),
				isDeleted: { $ne: true },
			})
		if (cleanPhone)
			conditions.push({
				phone: cleanPhone,
				isDeleted: { $ne: true },
			})

		const existingUser = await User.findOne({ $or: conditions })
		if (existingUser) {
			return next(
				new ErrorHandler(
					'An account already exists with this email or phone.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Hash password
		const salt = await bcrypt.genSalt(10)
		const hashedPassword = await bcrypt.hash(signupData.password, salt)

		// Determine verification status based on contact method
		const contactMethod = signupData.email ? 'email' : 'phone'

		// Create user with separate phone and phonePin
		const user = new User({
			name: signupData.name,
			email: signupData.email?.toLowerCase(),
			phone: cleanPhone,
			phonePin: signupData.phonePin,
			password: hashedPassword,
			emailVerifiedAt: contactMethod === 'email' ? new Date() : null,
			phoneVerifiedAt: contactMethod === 'phone' ? new Date() : null,
			isEnabled: true, // Account is enabled after verification
			preferredAppLanguage: signupData.preferredAppLanguage || 'en',
			timeZone: signupData.timeZone,
		})

		await user.save()

		// Send welcome notification
		sendNotificationToUser({
			userId: user._id,
			notificationKey: 'welcome',
		})

		// Create session
		const { deviceId, deviceName, deviceType, platform } = generateDeviceId(req)
		const token = user.generateAuthToken()

		await registerSession({
			userId: user._id,
			deviceId,
			deviceType,
			deviceName,
			token,
			platform,
		})

		res.header('x-auth-token', token)
		sendResponse({
			res,
			code: HTTP.CREATED,
			status: true,
			message: 'Account created successfully',
			data: {
				token,
				user: user.toSafeObject(),
			},
		})
	})
)

/**
 * POST /login
 * Password-based login with email or phone
 */
router.post(
	'/login',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const { emailOrPhone, password } = req.body

		if (!password) {
			return next(new ErrorHandler('Password is required.', HTTP.BAD_REQUEST))
		}

		if (!emailOrPhone) {
			return next(
				new ErrorHandler('Email or phone is required.', HTTP.BAD_REQUEST)
			)
		}

		// Detect if input is email or phone
		const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		const isEmailFormat = emailPattern.test(emailOrPhone)

		// Find user based on detected type
		let user
		if (isEmailFormat) {
			// Search by email
			user = await User.findOne({
				email: emailOrPhone.toLowerCase(),
				$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
			})
		} else {
			// Phone number login - support both formats:
			// 1. With country code (E.164-like): "+14155552671" -> parse and match both fields
			// 2. Without country code: "4155552671" -> match phone field only

			if (emailOrPhone.startsWith('+')) {
				// User provided country code - parse and match both fields
				const parsed = parseE164ToComponents(emailOrPhone)
				if (parsed) {
					user = await User.findOne({
						phone: parsed.phone,
						phonePin: parsed.phonePin,
						$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
					})
				}
			}

			// If no match with E.164 or no country code provided, try matching phone only
			if (!user) {
				// Clean the input - remove all non-digits
				const cleanPhone = emailOrPhone.replace(/\D/g, '')

				if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
					user = await User.findOne({
						phone: cleanPhone,
						$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
					})
				}
			}
		}

		if (!user) {
			return next(
				new ErrorHandler('Invalid email/phone or password.', HTTP.UNAUTHORIZED)
			)
		}

		// Check if user has a password (might be OAuth-only user)
		if (!user.password) {
			return next(
				new ErrorHandler(
					'This account uses social login. Please sign in with Google or Apple.',
					HTTP.BAD_REQUEST,
					{ error: 'oauth_only_account' }
				)
			)
		}

		// Verify password
		const isValidPassword = await bcrypt.compare(password, user.password)
		if (!isValidPassword) {
			return next(
				new ErrorHandler('Invalid email/phone or password.', HTTP.UNAUTHORIZED)
			)
		}

		// Check if account is enabled
		if (!user.isEnabled) {
			return next(
				new ErrorHandler(
					'Your account is disabled. Please contact support.',
					HTTP.FORBIDDEN,
					{ error: 'account_disabled' }
				)
			)
		}

		// Create session
		const { deviceId, deviceName, deviceType, platform } = generateDeviceId(req)
		const token = user.generateAuthToken()

		await registerSession({
			userId: user._id,
			deviceId,
			deviceType,
			deviceName,
			token,
			platform,
		})

		// Get verification status
		const verificationStatus = {
			isVerified: !!(user.emailVerifiedAt || user.phoneVerifiedAt),
			emailVerifiedAt: user.emailVerifiedAt,
			phoneVerifiedAt: user.phoneVerifiedAt,
			needsVerification: !(user.emailVerifiedAt || user.phoneVerifiedAt),
		}

		res.header('x-auth-token', token)
		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Login successful',
			data: {
				token,
				user: user.toSafeObject(),
				verification: verificationStatus,
			},
		})
	})
)

// ==========================================
// OAUTH ENDPOINTS
// ==========================================

/**
 * POST /oauth/google
 * Google OAuth signup/login
 */
router.post(
	'/oauth/google',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const { idToken, accessToken, refreshToken } = req.body

		if (!idToken) {
			return next(
				new ErrorHandler('Google ID token is required.', HTTP.BAD_REQUEST)
			)
		}

		// Determine client type for token verification
		const clientType = req.clientType || 'web'
		let googleClientId

		try {
			googleClientId = getGoogleClientId(clientType)
		} catch (error) {
			return next(
				new ErrorHandler(
					`Google OAuth not configured for ${clientType}.`,
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}

		// Verify ID token server-side
		let verifiedUserData
		try {
			verifiedUserData = await verifyGoogleIdToken(idToken, googleClientId)
		} catch (error) {
			return next(
				new ErrorHandler(
					`Google token verification failed: ${error.message}`,
					HTTP.UNAUTHORIZED,
					{ error: 'token_verification_failed' }
				)
			)
		}

		// Extract user information from verified token
		const { providerId, email, firstName, lastName, name, image } =
			verifiedUserData

		// Combine firstName and lastName into name if name not provided
		const fullName =
			name ||
			(firstName || lastName
				? `${firstName || ''} ${lastName || ''}`.trim()
				: email.split('@')[0])

		let user
		let isNewUser = false

		// Check if OAuth account exists
		let oauthAccount = await OAuthAccount.findOne({
			provider: 'google',
			providerId,
		})

		if (oauthAccount) {
			// Existing OAuth account - login
			user = await User.findById(oauthAccount.userId)
			if (!user) {
				// User was deleted, remove OAuth account
				await OAuthAccount.deleteOne({ _id: oauthAccount._id })
				oauthAccount = null
			} else {
				// Update last used
				oauthAccount.lastUsedAt = new Date()
				if (accessToken) oauthAccount.accessToken = accessToken
				if (refreshToken) oauthAccount.refreshToken = refreshToken
				await oauthAccount.save()
			}
		}

		if (!oauthAccount) {
			// Check if user exists by email
			user = await User.findOne({
				email: email.toLowerCase(),
				$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
			})

			if (user) {
				// Link Google account to existing user
				oauthAccount = new OAuthAccount({
					userId: user._id,
					provider: 'google',
					providerId,
					email: email.toLowerCase(),
					accessToken,
					refreshToken,
					profile: {
						name: `${firstName || ''} ${lastName || ''}`.trim(),
						firstName,
						lastName,
						image,
					},
					linkedAt: new Date(),
					lastUsedAt: new Date(),
				})
				await oauthAccount.save()

				// Auto-verify email if not already verified
				if (!user.emailVerifiedAt) {
					user.emailVerifiedAt = new Date()
					user.isEnabled = true
					await user.save()
				}
			} else {
				// Create new user
				isNewUser = true

				user = new User({
					name: fullName,
					email: email.toLowerCase(),
					image,
					emailVerifiedAt: new Date(), // Auto-verify OAuth email
					isEnabled: true,
					preferredAppLanguage: 'en',
				})
				await user.save()

				// Create OAuth account
				oauthAccount = new OAuthAccount({
					userId: user._id,
					provider: 'google',
					providerId,
					email: email.toLowerCase(),
					accessToken,
					refreshToken,
					profile: {
						name: `${firstName || ''} ${lastName || ''}`.trim(),
						firstName,
						lastName,
						image,
					},
					linkedAt: new Date(),
					lastUsedAt: new Date(),
				})
				await oauthAccount.save()

				// Send welcome notification
				sendNotificationToUser({
					userId: user._id,
					notificationKey: 'welcome',
				})
			}
		}

		// Check if account is enabled
		if (!user.isEnabled) {
			return next(
				new ErrorHandler(
					'Your account is disabled. Please contact support.',
					HTTP.FORBIDDEN,
					{ error: 'account_disabled' }
				)
			)
		}

		// Create session
		const { deviceId, deviceName, deviceType, platform } = generateDeviceId(req)
		const token = user.generateAuthToken()

		await registerSession({
			userId: user._id,
			deviceId,
			deviceType,
			deviceName,
			token,
			platform,
		})

		res.header('x-auth-token', token)
		sendResponse({
			res,
			code: isNewUser ? HTTP.CREATED : HTTP.OK,
			status: true,
			message: isNewUser ? 'Account created successfully' : 'Login successful',
			data: {
				token,
				user: user.toSafeObject(),
				isNewUser,
			},
		})
	})
)

/**
 * POST /oauth/apple
 * Apple OAuth signup/login
 */
router.post(
	'/oauth/apple',
	clientTypeMiddleware,
	catchAsyncError(async (req, res, next) => {
		const {
			providerId,
			email,
			firstName,
			lastName,
			identityToken,
			authorizationCode,
		} = req.body

		if (!providerId) {
			return next(
				new ErrorHandler('Apple provider ID is required.', HTTP.BAD_REQUEST)
			)
		}

		// Combine firstName and lastName into name
		// Apple might not provide name on subsequent logins
		const name =
			firstName || lastName
				? `${firstName || ''} ${lastName || ''}`.trim()
				: email
					? email.split('@')[0]
					: 'Apple User'

		let user
		let isNewUser = false

		// Check if OAuth account exists
		let oauthAccount = await OAuthAccount.findOne({
			provider: 'apple',
			providerId,
		})

		if (oauthAccount) {
			// Existing OAuth account - login
			user = await User.findById(oauthAccount.userId)
			if (!user) {
				// User was deleted, remove OAuth account
				await OAuthAccount.deleteOne({ _id: oauthAccount._id })
				oauthAccount = null
			} else {
				// Update last used
				oauthAccount.lastUsedAt = new Date()
				await oauthAccount.save()
			}
		}

		if (!oauthAccount) {
			// For Apple, email might be a private relay or not provided on subsequent logins
			if (email) {
				// Check if user exists by email
				user = await User.findOne({
					email: email.toLowerCase(),
					$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
				})
			}

			if (user) {
				// Link Apple account to existing user
				oauthAccount = new OAuthAccount({
					userId: user._id,
					provider: 'apple',
					providerId,
					email: email?.toLowerCase(),
					profile: {
						firstName,
						lastName,
						name: `${firstName || ''} ${lastName || ''}`.trim(),
					},
					linkedAt: new Date(),
					lastUsedAt: new Date(),
				})
				await oauthAccount.save()

				// Auto-verify email if provided and not already verified
				if (email && !user.emailVerifiedAt) {
					user.emailVerifiedAt = new Date()
					user.isEnabled = true
					await user.save()
				}
			} else {
				// Create new user
				isNewUser = true

				user = new User({
					name: name,
					email: email?.toLowerCase(),
					emailVerifiedAt: email ? new Date() : null, // Auto-verify if email provided
					isEnabled: true,
					preferredAppLanguage: 'en',
				})
				await user.save()

				// Create OAuth account
				oauthAccount = new OAuthAccount({
					userId: user._id,
					provider: 'apple',
					providerId,
					email: email?.toLowerCase(),
					profile: {
						firstName,
						lastName,
						name: `${firstName || ''} ${lastName || ''}`.trim(),
					},
					linkedAt: new Date(),
					lastUsedAt: new Date(),
				})
				await oauthAccount.save()

				// Send welcome notification
				sendNotificationToUser({
					userId: user._id,
					notificationKey: 'welcome',
				})
			}
		}

		// Check if account is enabled
		if (!user.isEnabled) {
			return next(
				new ErrorHandler(
					'Your account is disabled. Please contact support.',
					HTTP.FORBIDDEN,
					{ error: 'account_disabled' }
				)
			)
		}

		// Create session
		const { deviceId, deviceName, deviceType, platform } = generateDeviceId(req)
		const token = user.generateAuthToken()

		await registerSession({
			userId: user._id,
			deviceId,
			deviceType,
			deviceName,
			token,
			platform,
		})

		res.header('x-auth-token', token)
		sendResponse({
			res,
			code: isNewUser ? HTTP.CREATED : HTTP.OK,
			status: true,
			message: isNewUser ? 'Account created successfully' : 'Login successful',
			data: {
				token,
				user: user.toSafeObject(),
				isNewUser,
			},
		})
	})
)

/**
 * POST /oauth/google/link
 * Link Google account to authenticated user
 */
router.post(
	'/oauth/google/link',
	[auth, clientTypeMiddleware],
	catchAsyncError(async (req, res, next) => {
		const { idToken } = req.body

		if (!idToken) {
			return next(
				new ErrorHandler('Google ID token is required.', HTTP.BAD_REQUEST)
			)
		}

		// Determine client type for token verification
		const clientType = req.clientType || 'web'
		let googleClientId

		try {
			googleClientId = getGoogleClientId(clientType)
		} catch (error) {
			return next(
				new ErrorHandler(
					`Google OAuth not configured for ${clientType}.`,
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}

		// Verify ID token server-side
		let verifiedUserData
		try {
			verifiedUserData = await verifyGoogleIdToken(idToken, googleClientId)
		} catch (error) {
			return next(
				new ErrorHandler(
					`Google token verification failed: ${error.message}`,
					HTTP.UNAUTHORIZED,
					{ error: 'token_verification_failed' }
				)
			)
		}

		const { providerId, email, firstName, lastName, name, image } =
			verifiedUserData

		// Check if Google account is already linked to another user
		const existingOAuthAccount = await OAuthAccount.findOne({
			provider: 'google',
			providerId,
		})

		if (existingOAuthAccount) {
			// Check if it's already linked to current user
			if (existingOAuthAccount.userId.toString() === req.user._id.toString()) {
				return next(
					new ErrorHandler(
						'Google account is already linked to your account.',
						HTTP.BAD_REQUEST
					)
				)
			}
			// Linked to different user
			return next(
				new ErrorHandler(
					'This Google account is already linked to another account.',
					HTTP.CONFLICT,
					{ error: 'account_already_linked' }
				)
			)
		}

		// Check if user already has Google account linked
		const userOAuthAccount = await OAuthAccount.findOne({
			userId: req.user._id,
			provider: 'google',
		})

		if (userOAuthAccount) {
			return next(
				new ErrorHandler(
					'You already have a Google account linked. Please unlink it first.',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Link Google account to current user
		const oauthAccount = new OAuthAccount({
			userId: req.user._id,
			provider: 'google',
			providerId,
			email: email.toLowerCase(),
			profile: {
				name: name || `${firstName || ''} ${lastName || ''}`.trim(),
				firstName,
				lastName,
				image,
			},
			linkedAt: new Date(),
			lastUsedAt: new Date(),
		})
		await oauthAccount.save()

		// Auto-verify email if not already verified
		const user = await User.findById(req.user._id)
		if (user && !user.emailVerifiedAt && user.email === email.toLowerCase()) {
			user.emailVerifiedAt = new Date()
			await user.save()
		}

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Google account linked successfully',
			data: {
				oauthAccount: {
					provider: oauthAccount.provider,
					email: oauthAccount.email,
					linkedAt: oauthAccount.linkedAt,
				},
			},
		})
	})
)

/**
 * DELETE /oauth/google/unlink
 * Unlink Google account from authenticated user
 */
router.delete(
	'/oauth/google/unlink',
	[auth],
	catchAsyncError(async (req, res, next) => {
		// Find Google OAuth account for current user
		const oauthAccount = await OAuthAccount.findOne({
			userId: req.user._id,
			provider: 'google',
		})

		if (!oauthAccount) {
			return next(
				new ErrorHandler(
					'No Google account linked to your account.',
					HTTP.NOT_FOUND
				)
			)
		}

		// Check if user has other authentication methods
		const user = await User.findById(req.user._id)
		if (!user) {
			return next(new ErrorHandler('User not found.', HTTP.NOT_FOUND))
		}

		// Check if user has password
		const hasPassword = !!user.password

		// Check if user has other OAuth accounts
		const otherOAuthAccounts = await OAuthAccount.find({
			userId: req.user._id,
			provider: { $ne: 'google' },
		})

		const hasOtherAuthMethods = hasPassword || otherOAuthAccounts.length > 0

		if (!hasOtherAuthMethods) {
			return next(
				new ErrorHandler(
					'Cannot unlink Google account. It is your only authentication method. Please set a password or link another account first.',
					HTTP.BAD_REQUEST,
					{ error: 'last_auth_method' }
				)
			)
		}

		// Unlink Google account
		await OAuthAccount.deleteOne({ _id: oauthAccount._id })

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Google account unlinked successfully',
			data: null,
		})
	})
)

// ==========================================
// SESSION MANAGEMENT ENDPOINTS
// ==========================================

/**
 * GET /sessions
 * Get all active sessions for the current user
 */
router.get(
	'/sessions',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const sessions = await getActiveSessions(req.user._id)

		// Mark current session
		const currentDeviceId = req.session.deviceId
		const sessionsData = sessions.map((session) => ({
			_id: session._id,
			deviceId: session.deviceId,
			deviceName: session.deviceName,
			deviceType: session.deviceType,
			platform: session.platform,
			loginAt: session.loginAt,
			lastActiveAt: session.lastActiveAt,
			isActive: session.isActive,
			isCurrent: session.deviceId === currentDeviceId,
		}))

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Sessions retrieved successfully',
			data: { sessions: sessionsData },
		})
	})
)

/**
 * DELETE /sessions/:sessionId
 * Logout a specific session
 */
router.delete(
	'/sessions/:sessionId',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const { sessionId } = req.params

		const session = await AuthSession.findOne({
			_id: sessionId,
			userId: req.user._id,
		})

		if (!session) {
			return next(new ErrorHandler('Session not found.', HTTP.NOT_FOUND))
		}

		// Don't allow logging out current session via this endpoint
		if (session.deviceId === req.session.deviceId) {
			return next(
				new ErrorHandler(
					'Cannot logout current session. Use /logout instead.',
					HTTP.BAD_REQUEST
				)
			)
		}

		session.isActive = false
		session.logoutAt = new Date()
		await session.save()

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Session logged out successfully',
			data: { sessionId },
		})
	})
)

/**
 * DELETE /sessions
 * Logout all sessions except current
 */
router.delete(
	'/sessions',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const result = await logoutAllSessionsExcept(
			req.user._id,
			req.session.deviceId
		)

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'All other sessions logged out successfully',
			data: { loggedOutCount: result.modifiedCount || 0 },
		})
	})
)

/**
 * POST /logout
 * Logout current session - invalidate current session
 */
router.post(
	'/logout',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const token = req.header('x-auth-token')

		if (!token) {
			return next(
				new ErrorHandler('Token is required for logout.', HTTP.BAD_REQUEST)
			)
		}

		// Invalidate session by token (fire and forget - don't wait)
		AuthSession.invalidateByToken(token).catch((err) => {
			console.error('Error invalidating session on logout:', err)
		})

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Logged out successfully',
			data: null,
		})
	})
)

/**
 * GET /me
 * Get current user profile with verification status
 */
router.get(
	'/me',
	[auth],
	catchAsyncError(async (req, res, next) => {
		const user = await User.findById(req.user._id)

		if (!user) {
			return next(new ErrorHandler('User not found.', HTTP.NOT_FOUND))
		}

		// Get OAuth accounts
		const oauthAccounts = await OAuthAccount.find({ userId: user._id })
			.select('provider email linkedAt lastUsedAt')
			.lean()

		// Check if user can safely unlink each OAuth account
		const hasPassword = !!user.password
		const oauthAccountsWithStatus = await Promise.all(
			oauthAccounts.map(async (account) => {
				// Count other OAuth accounts (excluding current one)
				const otherOAuthCount = await OAuthAccount.countDocuments({
					userId: user._id,
					provider: { $ne: account.provider },
				})

				// Can unlink if user has password or other OAuth accounts
				const canUnlink = hasPassword || otherOAuthCount > 0

				return {
					...account,
					canUnlink,
				}
			})
		)

		const userData = user.toSafeObject()
		userData.oauthAccounts = oauthAccountsWithStatus
		userData.verification = {
			isVerified: !!(user.emailVerifiedAt || user.phoneVerifiedAt),
			emailVerifiedAt: user.emailVerifiedAt,
			phoneVerifiedAt: user.phoneVerifiedAt,
			needsVerification: !(user.emailVerifiedAt || user.phoneVerifiedAt),
		}

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'User profile retrieved successfully',
			data: { user: userData },
		})
	})
)

module.exports = router
