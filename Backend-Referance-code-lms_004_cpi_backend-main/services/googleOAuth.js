const { OAuth2Client } = require('google-auth-library')
const config = require('config')

/**
 * Verify Google ID token and extract user information
 * @param {string} idToken - Google ID token from client
 * @param {string} clientId - Google Client ID to verify against
 * @returns {Promise<Object>} Verified user data from token
 * @throws {Error} If token verification fails
 */
async function verifyGoogleIdToken(idToken, clientId) {
	if (!idToken) {
		throw new Error('ID token is required')
	}

	if (!clientId) {
		throw new Error('Google Client ID is required')
	}

	try {
		const client = new OAuth2Client(clientId)

		// Verify the ID token
		const ticket = await client.verifyIdToken({
			idToken: idToken,
			audience: clientId, // Verify the token was issued for this client
		})

		// Get the payload from the verified token
		const payload = ticket.getPayload()

		if (!payload) {
			throw new Error('Invalid token payload')
		}

		// Extract user information
		const userData = {
			providerId: payload.sub, // Google user ID (unique identifier)
			email: payload.email,
			emailVerified: payload.email_verified || false,
			name: payload.name || '',
			firstName: payload.given_name || '',
			lastName: payload.family_name || '',
			image: payload.picture || null,
			locale: payload.locale || null,
		}

		// Validate required fields
		if (!userData.providerId) {
			throw new Error('Provider ID (sub) is missing from token')
		}

		if (!userData.email) {
			throw new Error('Email is missing from token')
		}

		return userData
	} catch (error) {
		// Handle specific Google Auth errors
		if (error.message.includes('Token used too early')) {
			throw new Error('Token is not yet valid')
		}
		if (error.message.includes('Token used too late')) {
			throw new Error('Token has expired')
		}
		if (error.message.includes('Invalid token signature')) {
			throw new Error('Invalid token signature')
		}
		if (error.message.includes('Wrong recipient')) {
			throw new Error('Token was issued for a different client')
		}

		// Re-throw with more context
		throw new Error(`Google token verification failed: ${error.message}`)
	}
}

/**
 * Get Google Client ID from environment
 * @param {string} clientType - 'web', 'ios', or 'android'
 * @returns {string} Google Client ID
 */
function getGoogleClientId(clientType = 'web') {
	// For web, use GOOGLE_CLIENT_ID_WEB
	const envKey =
		clientType === 'web'
			? 'GOOGLE_CLIENT_ID_WEB'
			: `GOOGLE_CLIENT_ID_${clientType.toUpperCase()}`

	// Try environment variable first, then config
	const clientId = config.get(envKey)

	if (!clientId) {
		throw new Error(
			`Google Client ID for ${clientType} is not configured. Please set ${envKey} in your environment variables.`
		)
	}

	return clientId
}

module.exports = {
	verifyGoogleIdToken,
	getGoogleClientId,
}
