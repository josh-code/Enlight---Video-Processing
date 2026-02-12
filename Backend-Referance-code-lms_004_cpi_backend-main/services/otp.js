const config = require('config')
const crypto = require('crypto')
const OTP = require('../models/admin/otp_model')
const sendMail = require('./mail')
const { sendSmsToPhone } = require('./twillio')

const { OTP_LIMIT } = require('../contant')

const OTP_TRACKING_PLACEHOLDER = '__TRACKING__'

const expirationTimeMinutes =
	parseInt(config.get('EXPIRATION_TIME_MINUTES'), 10) || 10

// Resend OTP cooldown period (1 minute in milliseconds)
const RESEND_COOLDOWN_MS = 60 * 1000 // 1 minute

function normalizeToE164(phonePin, phone) {
	// If phone is already in E.164 format, return as-is
	if (phone && phone.startsWith('+')) {
		const e164Pattern = /^\+[1-9]\d{1,14}$/
		if (e164Pattern.test(phone)) {
			return phone
		}
		return null // Invalid E.164 format
	}

	// Legacy support: combine phonePin and phone
	if (!phonePin || !phone) {
		return null
	}

	// Remove any non-digit characters from phone
	const cleanPhone = phone.replace(/\D/g, '')

	// Ensure phonePin starts with +
	const cleanPhonePin = phonePin.startsWith('+') ? phonePin : `+${phonePin}`

	// Combine and return E.164 format
	const normalized = `${cleanPhonePin}${cleanPhone}`
	const e164Pattern = /^\+[1-9]\d{1,14}$/
	if (e164Pattern.test(normalized)) {
		return normalized
	}
	return null
}

const generateOTP = () => {
	return crypto.randomInt(100000, 999999).toString()
}

const generateResetToken = () => {
	return crypto.randomBytes(32).toString('hex')
}

const checkCooldown = async (userId) => {
	if (!userId) {
		return { canResend: true, remainingSeconds: 0 }
	}

	const existingOTP = await OTP.findOne({ userId })

	// If no OTP exists, can resend immediately
	if (!existingOTP || !existingOTP.createdAt) {
		return { canResend: true, remainingSeconds: 0 }
	}

	const timeSinceCreation =
		Date.now() - new Date(existingOTP.createdAt).getTime()
	const remainingMs = RESEND_COOLDOWN_MS - timeSinceCreation

	if (remainingMs > 0) {
		const remainingSeconds = Math.ceil(remainingMs / 1000)
		return { canResend: false, remainingSeconds }
	}

	return { canResend: true, remainingSeconds: 0 }
}

const checkRequestLimit = async (userId) => {
	if (!userId) {
		return { withinLimit: true, remainingRequests: OTP_LIMIT.MAX_REQUESTS }
	}

	const existingOTP = await OTP.findOne({ userId })
	const now = Date.now()
	const timeWindowMs = OTP_LIMIT.TIME_WINDOW_MINUTES * 60 * 1000
	const windowStart = now - timeWindowMs

	let requestHistory = []
	if (
		existingOTP &&
		existingOTP.requestHistory &&
		Array.isArray(existingOTP.requestHistory)
	) {
		requestHistory = existingOTP.requestHistory
			.map((timestamp) => new Date(timestamp).getTime())
			.filter((timestamp) => timestamp > windowStart) // Keep only requests within the time window
	}

	// Count requests in the last 30 minutes
	const requestsInWindow = requestHistory.length

	// Check limit
	if (requestsInWindow >= OTP_LIMIT.MAX_REQUESTS) {
		const oldestRequest = requestHistory.sort((a, b) => a - b)[0]
		const resetTime = new Date(oldestRequest + timeWindowMs)
		const remainingSeconds = Math.ceil((resetTime.getTime() - now) / 1000)

		return {
			withinLimit: false,
			limitType: 'rate_limit',
			message: `You have reached the maximum of ${OTP_LIMIT.MAX_REQUESTS} OTP requests per ${OTP_LIMIT.TIME_WINDOW_MINUTES} minutes. Please try again later.`,
			remainingRequests: 0,
			resetTime: resetTime,
			remainingSeconds: remainingSeconds > 0 ? remainingSeconds : 0,
		}
	}

	return {
		withinLimit: true,
		remainingRequests: OTP_LIMIT.MAX_REQUESTS - requestsInWindow,
		requestsInWindow,
	}
}

const createAndSendOTP = async (
	user,
	method,
	emailOptions,
	skipCooldown = false
) => {
	// Check cooldown before proceeding (unless explicitly skipped)
	if (!skipCooldown) {
		const cooldownCheck = await checkCooldown(user._id)
		if (!cooldownCheck.canResend) {
			return {
				success: false,
				message: `Please wait ${cooldownCheck.remainingSeconds} seconds before requesting a new OTP.`,
				cooldownRemaining: cooldownCheck.remainingSeconds,
			}
		}
	}

	const limitCheck = await checkRequestLimit(user._id)
	if (!limitCheck.withinLimit) {
		return {
			success: false,
			message: limitCheck.message,
			limitExceeded: true,
			limitType: limitCheck.limitType,
			resetTime: limitCheck.resetTime,
			remainingSeconds: limitCheck.remainingSeconds,
		}
	}

	// Get existing OTP to preserve requestHistory
	const existingOTP = await OTP.findOne({ userId: user._id })
	let requestHistory = []

	if (
		existingOTP &&
		existingOTP.requestHistory &&
		Array.isArray(existingOTP.requestHistory)
	) {
		const now = Date.now()
		const timeWindowMs = OTP_LIMIT.TIME_WINDOW_MINUTES * 60 * 1000
		const windowStart = now - timeWindowMs
		// Keep only requests within the time window
		requestHistory = existingOTP.requestHistory
			.map((timestamp) => new Date(timestamp))
			.filter((timestamp) => timestamp.getTime() > windowStart)
	}

	const otp = generateOTP()
	const expiresAt = new Date(Date.now() + expirationTimeMinutes * 60 * 1000)

	let otpSent = { success: false, message: 'Invalid method' }

	// Determine where to send the OTP based on the method parameter
	if (method === 'phone' || method === 'both') {
		// Phone should already be in E.164 format, but normalize if needed
		let normalizedPhone = user.phone
		if (normalizedPhone && !normalizedPhone.startsWith('+')) {
			// Try to normalize using phonePin if available (legacy support)
			normalizedPhone = normalizeToE164(user.phonePin, user.phone)
		} else if (normalizedPhone) {
			// Validate E.164 format
			const e164Pattern = /^\+[1-9]\d{1,14}$/
			if (!e164Pattern.test(normalizedPhone)) {
				return {
					success: false,
					message: 'Invalid phone number format.',
				}
			}
		}

		if (!normalizedPhone) {
			return {
				success: false,
				message: 'Invalid phone number format.',
			}
		}

		console.log('normalizedPhone', normalizedPhone)
		const body = `Your CPI verification code is ${otp}.`
		otpSent = await sendSmsToPhone(normalizedPhone, body)
		if (!otpSent.success) {
			return {
				success: false,
				message: `Failed to send OTP to phone: ${otpSent.message}`,
			}
		}
	}

	if (method === 'email' || method === 'both') {
		const { subject, template } = emailOptions

		if (!subject || !template) {
			return {
				success: false,
				message: 'Subject and template are required for email',
			}
		}

		const emailData = {
			subject: subject,
			send_to: user.email,
			template: template,
			context: {
				expirationTimeMinutes,
				otp,
				year: new Date().getFullYear(),
			},
		}

		otpSent = await sendMail(emailData)
		if (!otpSent.success) {
			return {
				success: false,
				message: `Failed to send OTP to email: ${otpSent.message}`,
			}
		}
	}

	if (otpSent.success) {
		await OTP.deleteOne({ userId: user._id })
		requestHistory.push(new Date())
		const newOTP = new OTP({
			userId: user._id,
			otp,
			expiresAt,
			requestHistory: requestHistory,
		})
		await newOTP.save()
	}

	return {
		success: true,
		message: 'OTP sent successfully',
		cooldownRemaining: RESEND_COOLDOWN_MS / 1000,
		remainingRequests: limitCheck.remainingRequests,
	}
}

function getTrackingExpirationDate() {
	return new Date(Date.now() + 1000)
}

async function preserveRequestHistory(userId, requestHistory) {
	if (
		!userId ||
		!Array.isArray(requestHistory) ||
		requestHistory.length === 0
	) {
		return
	}

	await OTP.create({
		userId,
		otp: OTP_TRACKING_PLACEHOLDER,
		expiresAt: getTrackingExpirationDate(),
		requestHistory,
	})
}

const verifyOTP = async (user, otp) => {
	const existingOTP = await OTP.findOne({ userId: user._id })

	if (!existingOTP || existingOTP.otp !== otp) {
		return { success: false, message: 'Invalid code' }
	}

	const requestHistory = existingOTP.requestHistory || []
	const isExpired = new Date() > existingOTP.expiresAt

	await OTP.deleteOne({ _id: existingOTP._id })
	await preserveRequestHistory(user._id, requestHistory)

	if (isExpired) {
		return { success: false, message: 'code expired' }
	}

	return { success: true, message: 'code verified' }
}

module.exports = {
	generateOTP,
	generateResetToken,
	verifyOTP,
	createAndSendOTP,
	normalizeToE164,
	checkCooldown,
	checkRequestLimit,
}
