/**
 * S3 Configuration Constants
 * Use these constants for S3-related configurations like URL expiration times.
 *
 * Example usage:
 *   const S3_CONSTANTS = require('../../constants/s3');
 *   const url = await generateObjectUrl(key, S3_CONSTANTS.URL_EXPIRATION.DEFAULT);
 */

module.exports = {
	// URL expiration times in seconds
	URL_EXPIRATION: {
		// Default expiration: 1 hour (3600 seconds)
		DEFAULT: 3600,

		// Short-lived URLs: 15 minutes (900 seconds)
		SHORT: 900,

		// Medium-lived URLs: 1 hour (3600 seconds)
		MEDIUM: 3600,

		// Long-lived URLs: 24 hours (86400 seconds)
		LONG: 86400,

		// Extended URLs: 7 days (604800 seconds)
		EXTENDED: 604800,
	},
}
