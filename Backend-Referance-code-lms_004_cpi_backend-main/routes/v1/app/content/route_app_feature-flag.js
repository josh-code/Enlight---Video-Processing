const express = require('express')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const { loadFeatureFlags } = require('../../../../services/featureFlag')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')
const router = express.Router()

const FeatureFlagType = {
	Mobile: 'mobile',
	WebApp: 'webApp',
}

router.get(
	'/get-app-feature',
	catchAsyncError(async (req, res, next) => {
		const { platform } = req.query

		if (!platform) {
			return next(new ErrorHandler('Platform is required', HTTP.BAD_REQUEST))
		}

		if (
			platform !== FeatureFlagType.Mobile &&
			platform !== FeatureFlagType.WebApp
		) {
			return next(new ErrorHandler('Invalid platform', HTTP.BAD_REQUEST))
		}

		const featureFlags = await loadFeatureFlags()

		let filteredFeatures = featureFlags

		if (platform === FeatureFlagType.Mobile) {
			filteredFeatures = featureFlags.mobile || {}
		} else if (platform === FeatureFlagType.WebApp) {
			filteredFeatures = featureFlags.webApp || {}
		} else {
			return next(new ErrorHandler('Invalid platform', HTTP.BAD_REQUEST))
		}

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Feature flags retrieved successfully',
			data: filteredFeatures,
		})
	})
)

module.exports = router
