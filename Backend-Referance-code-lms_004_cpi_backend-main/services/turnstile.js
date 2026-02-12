const axios = require('axios')
const config = require('config')

const TURNSTILE_VERIFY_URL =
	'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function getRemoteIp(reqIp) {
	if (!reqIp) return undefined
	if (Array.isArray(reqIp)) {
		return reqIp[0]
	}
	return reqIp
}

const getTurnstileSecret = () => {
	if (config.has('TURNSTILE_SECRET_KEY')) {
		return config.get('TURNSTILE_SECRET_KEY')
	}
	return null
}

const parseErrorMessage = (errorCodes = []) => {
	if (!Array.isArray(errorCodes) || errorCodes.length === 0) {
		return 'Captcha verification failed. Please try again.'
	}

	if (errorCodes.includes('timeout-or-duplicate')) {
		return 'Captcha expired or already used. Please refresh and try again.'
	}

	if (errorCodes.includes('invalid-input-response')) {
		return 'Invalid captcha token provided.'
	}

	return 'Captcha verification failed. Please try again.'
}

async function verifyTurnstileToken(token, remoteIp) {
	const secret = getTurnstileSecret()

	if (!secret) {
		throw new Error('Turnstile secret key is not configured.')
	}

	if (!token) {
		return { success: false, message: 'Captcha token is missing.' }
	}

	try {
		const params = new URLSearchParams()
		params.append('secret', secret)
		params.append('response', token)

		const normalizedIp = getRemoteIp(remoteIp)
		if (normalizedIp) {
			params.append('remoteip', normalizedIp)
		}

		const { data } = await axios.post(TURNSTILE_VERIFY_URL, params, {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			timeout: 5000,
		})

		if (data?.success) {
			return { success: true }
		}

		const errorCodes = data?.['error-codes'] || []
		return {
			success: false,
			message: parseErrorMessage(errorCodes),
			errorCodes,
		}
	} catch (error) {
		console.error(
			'Turnstile verification failed:',
			error?.response?.data || error.message
		)
		throw new Error('Unable to verify captcha token. Please try again later.')
	}
}

module.exports = {
	verifyTurnstileToken,
}
