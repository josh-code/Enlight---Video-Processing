const AppVersion = require('../../../../models/common/content/appVersion_model')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

const router = require('express').Router()

router.get(
	'/active',
	catchAsyncError(async (req, res, next) => {
		const { platform } = req.query

		if (!platform) {
			return next(new ErrorHandler('Platform is required', HTTP.BAD_REQUEST))
		}

		const activeAppVersions = await AppVersion.find({
			isActive: true,
			platform,
		}).lean()

		sendResponse({
			res,
			code: HTTP.OK,
			status: true,
			message: 'Active app versions retrieved successfully',
			data: activeAppVersions,
		})
	})
)

module.exports = router
