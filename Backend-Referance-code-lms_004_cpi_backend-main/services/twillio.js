const config = require('config')
const accountSid = config.get('TWILIO_ACCOUNT_SID')
const authToken = config.get('TWILIO_AUTH_TOKEN')
const twilioPhoneNumber = config.get('TWILIO_PHONE_NUMBER')
const client = require('twilio')(accountSid, authToken)

async function sendSmsToPhone(phone, body) {
	try {
		// Basic validation
		if (!phone || !body) {
			return {
				success: false,
				message: 'Phone number and message are required',
			}
		}

		// Validate phone number format
		const phoneRegex = /^\+[1-9]\d{1,14}$/
		if (!phoneRegex.test(phone)) {
			return {
				success: false,
				message:
					'Please enter a valid phone number with country code (e.g., +1234567890)',
			}
		}

		// Check message length
		if (body.length > 1600) {
			return {
				success: false,
				message: 'Message is too long. Please keep it under 1600 characters',
			}
		}

		const message = await client.messages.create({
			body: body,
			from: twilioPhoneNumber,
			to: phone,
		})

		return {
			success: true,
			message: 'SMS sent successfully',
			messageId: message.sid,
		}
	} catch (error) {
		// Log detailed error for debugging (server-side only)
		console.error('Twilio SMS Error:', {
			code: error.code,
			message: error.message,
			phone: phone,
			timestamp: new Date().toISOString(),
			stack: error.stack,
		})

		// Return user-friendly messages based on error type
		return getUserFriendlyError(error)
	}
}

async function verifyPhoneNumber(phone) {
	try {
		const phoneNumber = await client.lookups.v2.phoneNumbers(phone).fetch()

		console.log({ phoneNumber })

		// Check if the phone number is valid
		if (!phoneNumber.valid) {
			// Handle both snake_case and camelCase property names
			const validationErrors =
				phoneNumber.validationErrors || phoneNumber.validation_errors || []

			// Handle specific validation errors
			if (validationErrors.includes('TOO_LONG')) {
				return {
					success: false,
					message: 'Phone number is too long. Please check and try again.',
					phoneNumber: phoneNumber,
				}
			}

			if (validationErrors.includes('TOO_SHORT')) {
				return {
					success: false,
					message: 'Phone number is too short. Please check and try again.',
					phoneNumber: phoneNumber,
				}
			}

			if (validationErrors.includes('INVALID_COUNTRY_CODE')) {
				return {
					success: false,
					message: 'Invalid country code. Please check and try again.',
					phoneNumber: phoneNumber,
				}
			}

			// Generic validation error message
			return {
				success: false,
				message: 'Invalid phone number. Please check and try again.',
				phoneNumber: phoneNumber,
			}
		}

		return {
			success: true,
			message: 'Phone number verified successfully',
			phoneNumber: phoneNumber,
		}
	} catch (error) {
		return getUserFriendlyError(error)
	}
}

function getUserFriendlyError(error) {
	const errorCode = error.code

	switch (errorCode) {
		// User-actionable errors
		case 21211:
			return {
				success: false,
				message: 'Invalid phone number. Please check and try again',
			}

		case 21614:
		case 30006:
			return {
				success: false,
				message: 'SMS can only be sent to mobile phone numbers',
			}

		case 21602:
			return {
				success: false,
				message: 'Message content is required',
			}

		case 21605:
			return {
				success: false,
				message: 'Message is too long. Please shorten your message',
			}

		case 30003:
			return {
				success: false,
				message:
					'Phone number is unreachable. Please check the number and try again',
			}

		case 30004:
			return {
				success: false,
				message:
					'Message could not be delivered. The number may have blocked SMS',
			}

		case 21611:
			return {
				success: false,
				message: 'This phone number cannot receive text messages',
			}

		// Rate limiting - user can retry
		case 20429:
			return {
				success: false,
				message: 'Too many messages sent. Please wait a moment and try again',
			}

		// All other errors (technical/internal issues)
		// Don't expose details to user
		case 20003: // Authentication
		case 20005: // Account issues
		case 21408: // Regional restrictions
		case 21610: // Unverified (trial account)
		case 21617: // Insufficient balance
		case 30001: // Queue overflow
		case 30002: // Account suspended
		case 63016: // Consent required
		case 63017: // Opted out
		default:
			return {
				success: false,
				message:
					'SMS service is temporarily unavailable. Please try again later',
			}
	}
}

module.exports = {
	sendSmsToPhone,
	verifyPhoneNumber,
}
