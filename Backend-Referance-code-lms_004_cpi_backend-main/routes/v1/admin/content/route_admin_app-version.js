const AppVersion = require('../../../../models/common/content/appVersion_model')
const auth = require('../../../../middleware/auth')
const superAdmin = require('../../../../middleware/superAdmin')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')
const {
	getPaginationParams,
	buildPaginatedResponse,
} = require('../../../../utils/pagination')

const router = require('express').Router()

router.get(
	'/all',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const match = {}

		if (req.query.platform) {
			match.platform = req.query.platform
		}

		if (req.query.isActive) {
			match.isActive = req.query.isActive === 'true'
		}

		let sort = {}
		if (req.query.sortField) {
			const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
			sort[req.query.sortField] = sortOrder
		} else {
			sort = { releaseDate: -1 }
		}

		// Get total count BEFORE pagination
		const total = await AppVersion.countDocuments(match)

		// Get pagination params
		const { page, limit, skip } = getPaginationParams(req.query)

		const pipeline = [
			{ $match: match },
			{ $sort: sort },
			{ $skip: skip },
			{ $limit: limit },
		]

		const appVersions = await AppVersion.aggregate(pipeline)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: buildPaginatedResponse(
				appVersions,
				page,
				limit,
				total,
				'appVersions'
			),
			message: 'App versions fetched successfully',
		})
	})
)

router.post(
	'/add-app',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { platform, version, releaseDate, isActive } = req.body

		if (!platform || !version) {
			return next(
				new ErrorHandler('Platform and version are required', HTTP.BAD_REQUEST)
			)
		}

		const existingAppVersion = await AppVersion.findOne({ platform, version })
		if (existingAppVersion) {
			return next(
				new ErrorHandler('App version already exists', HTTP.BAD_REQUEST)
			)
		}

		const newAppVersion = await AppVersion.create({
			platform,
			version,
			releaseDate,
			isActive,
		})

		return sendResponse({
			res,
			status: true,
			code: HTTP.CREATED,
			data: newAppVersion,
			message: 'App added successfully',
		})
	})
)

// Change status of multiple selected version
router.put(
	'/change-status',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { versionIds, isActive } = req.body

		if (!versionIds || !Array.isArray(versionIds) || versionIds.length === 0) {
			return next(
				new ErrorHandler('Version IDs are required', HTTP.BAD_REQUEST)
			)
		}

		await AppVersion.updateMany(
			{ _id: { $in: versionIds } },
			{ $set: { isActive } }
		)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Status updated successfully',
		})
	})
)

module.exports = router
