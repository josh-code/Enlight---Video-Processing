const _ = require('lodash')
const FeatureFlags = require('../models/common/content/features_model')

const featureFlagMiddleware = ({ webPath, mobilePath }) => {
	return async (req, res, next) => {
		try {
			const clientType = req.clientType

			const featureFlags = await FeatureFlags.findOne().lean()

			if (!featureFlags?.data) {
				return res.status(503).json({
					success: false,
					error: 'Feature flags configuration unavailable',
				})
			}

			const platform = clientType === 'mobile' ? 'mobile' : 'webApp'
			const featurePath = clientType === 'mobile' ? mobilePath : webPath

			const featureExists = _.has(
				featureFlags.data,
				`${platform}.${featurePath}`
			)

			if (!featureExists) {
				const alternativePlatform = clientType === 'mobile' ? 'web' : 'mobile'
				return res.status(404).json({
					success: false,
					error: `Feature not available for ${clientType} clients`,
					suggestion: `This feature may only be available for ${alternativePlatform} clients`,
				})
			}

			const isEnabled = _.get(
				featureFlags.data,
				`${
					clientType === 'mobile' ? 'mobile' : 'webApp'
				}.${featurePath}.enabled`
			)

			if (!isEnabled) {
				return res.status(403).json({
					success: false,
					error: `This feature is disabled for ${clientType} clients`,
					details: {
						featurePath,
						clientType,
					},
				})
			}

			next()
		} catch (error) {
			console.error('Feature flag check error:', error)
			res.status(500).json({
				success: false,
				error: 'Internal server error during feature flag verification',
			})
		}
	}
}

module.exports = featureFlagMiddleware
