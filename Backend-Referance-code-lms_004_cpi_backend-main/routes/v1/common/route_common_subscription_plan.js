const catchAsyncError = require('../../../middleware/catchAsyncError')
const { extractLanguage } = require('../../../middleware/languageFilter')
const {
	SubscriptionPlan,
} = require('../../../models/common/subscription_plan_model')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')
const { DEFAULT_LANGUAGE } = require('../../../constants/supportedLanguage')

const router = require('express').Router()

/**
 * Helper function to localize subscription plan fields
 * @param {Object} plan - Subscription plan document
 * @param {string} language - Language code
 * @returns {Object} Localized subscription plan
 */
function localizeSubscriptionPlan(plan, language = DEFAULT_LANGUAGE) {
	const localized = {
		_id: plan._id,
		name: plan.name?.[language] || plan.name?.en || '',
		description: plan.description?.[language] || plan.description?.en || '',
		features: plan.features
			? plan.features.map((feature) => feature[language] || feature.en || '')
			: [],
		monthly: plan.monthly,
		yearly: plan.yearly,
		isActive: plan.isActive,
		createdAt: plan.createdAt,
		updatedAt: plan.updatedAt,
	}

	return localized
}

router.get(
	'/',
	[extractLanguage],
	catchAsyncError(async (req, res, next) => {
		const language = req.language

		const subscriptionPlan = await SubscriptionPlan.findOne({
			isActive: true,
		}).lean()

		if (!subscriptionPlan) {
			return next(
				new ErrorHandler('No active subscription plan found', HTTP.NOT_FOUND)
			)
		}

		// Localize subscription plan based on requested language
		const localizedPlan = localizeSubscriptionPlan(subscriptionPlan, language)

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: localizedPlan,
			message: 'Subscription plan retrieved successfully',
		})
	})
)

router.get(
	'/:id',
	catchAsyncError(async (req, res, next) => {
		const subscriptionPlan = await SubscriptionPlan.findById(req.params.id)
		if (!subscriptionPlan) {
			return next(
				new ErrorHandler('Subscription plan not found', HTTP.NOT_FOUND)
			)
		}
		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: subscriptionPlan,
			message: 'Subscription plan retrieved successfully',
		})
	})
)

module.exports = router
