const express = require('express')
const {
	loadFeatureFlags,
	saveFeatureFlags,
} = require('../../../../services/featureFlag')
const router = express.Router()
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

router.post(
	'/add-feature',
	catchAsyncError(async (req, res, next) => {
		const { path: nestedPath, newKey, newValue } = req.body

		if (!newKey || !newValue || !Array.isArray(nestedPath)) {
			return next(new ErrorHandler('Invalid payload', HTTP.BAD_REQUEST))
		}

		const featureFlags = await loadFeatureFlags()

		let current = featureFlags
		for (const key of nestedPath) {
			if (!current[key]) {
				current[key] = {}
			}
			current = current[key]
		}

		if (current.hasOwnProperty(newKey)) {
			return next(
				new ErrorHandler(
					`Feature key "${newKey}" already exists.`,
					HTTP.CONFLICT
				)
			)
		}

		current[newKey] = newValue

		await saveFeatureFlags(featureFlags)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: featureFlags,
			message: 'Feature flag added successfully',
		})
	})
)

router.delete(
	'/delete-feature',
	catchAsyncError(async (req, res, next) => {
		const { path: nestedPath, deleteKey } = req.body

		if (!deleteKey || !Array.isArray(nestedPath)) {
			return next(new ErrorHandler('Invalid payload', HTTP.BAD_REQUEST))
		}

		const featureFlags = await loadFeatureFlags()

		if (nestedPath.length === 0) {
			if (featureFlags.hasOwnProperty(deleteKey)) {
				delete featureFlags[deleteKey]
				await saveFeatureFlags(featureFlags)
				return sendResponse({
					res,
					status: true,
					code: HTTP.OK,
					data: featureFlags,
					message: 'Feature flag deleted successfully',
				})
			} else {
				return next(
					new ErrorHandler('Key not found at root level', HTTP.NOT_FOUND)
				)
			}
		}

		let current = featureFlags
		for (let i = 0; i < nestedPath.length; i++) {
			const key = nestedPath[i]

			if (!current[key]) {
				return next(new ErrorHandler('Path not found', HTTP.NOT_FOUND))
			}

			if (
				i === nestedPath.length - 1 &&
				current[key][deleteKey] !== undefined
			) {
				delete current[key][deleteKey]
				await saveFeatureFlags(featureFlags)
				return sendResponse({
					res,
					status: true,
					code: HTTP.OK,
					data: featureFlags,
					message: 'Feature flag deleted successfully',
				})
			}

			current = current[key]
		}

		return next(new ErrorHandler('Key not found', HTTP.NOT_FOUND))
	})
)

router.get(
	'/get-feature',
	catchAsyncError(async (req, res, next) => {
		const featureFlags = await loadFeatureFlags()
		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: featureFlags,
			message: 'Feature flags fetched successfully',
		})
	})
)

router.patch(
	'/enable',
	catchAsyncError(async (req, res, next) => {
		const { platform, path, value } = req.body

		if (!platform || !path || typeof value !== 'boolean') {
			return next(
				new ErrorHandler(
					'platform, path, and boolean value are required',
					HTTP.BAD_REQUEST
				)
			)
		}

		const featureFlags = await loadFeatureFlags()
		const keys = path.split('.')

		let current = featureFlags[platform]
		for (let i = 0; i < keys.length - 1; i++) {
			if (!current[keys[i]]) {
				return next(new ErrorHandler('Feature path not found', HTTP.NOT_FOUND))
			}
			current = current[keys[i]]
		}

		if (!current[keys[keys.length - 1]]) {
			return next(new ErrorHandler('Feature path not found', HTTP.NOT_FOUND))
		}

		current[keys[keys.length - 1]].enabled = value
		await saveFeatureFlags(featureFlags)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: featureFlags[platform],
			message: 'Feature updated successfully',
		})
	})
)

router.patch(
	'/toggle-abtest',
	catchAsyncError(async (req, res, next) => {
		const { platform, path } = req.body

		if (!platform || !path) {
			return next(
				new ErrorHandler('platform and path are required', HTTP.BAD_REQUEST)
			)
		}

		const featureFlags = await loadFeatureFlags()
		const keys = path.split('.')

		let current = featureFlags[platform]
		for (let i = 0; i < keys.length - 1; i++) {
			if (!current[keys[i]]) {
				return next(new ErrorHandler('Feature path not found', HTTP.NOT_FOUND))
			}
			current = current[keys[i]]
		}

		if (!current[keys[keys.length - 1]]) {
			return next(new ErrorHandler('Feature path not found', HTTP.NOT_FOUND))
		}

		current[keys[keys.length - 1]].abTesting =
			!current[keys[keys.length - 1]].abTesting
		await saveFeatureFlags(featureFlags)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: featureFlags[platform],
			message: 'A/B Testing toggled successfully',
		})
	})
)

router.patch(
	'/update-feature',
	catchAsyncError(async (req, res, next) => {
		const { path, field, value } = req.body

		if (!Array.isArray(path) || path.length === 0 || !field) {
			return next(
				new ErrorHandler(
					'path (array) and field are required',
					HTTP.BAD_REQUEST
				)
			)
		}

		const featureFlags = await loadFeatureFlags()

		let current = featureFlags
		for (let i = 0; i < path.length - 1; i++) {
			if (!current[path[i]]) {
				return next(new ErrorHandler('Feature path not found', HTTP.NOT_FOUND))
			}
			current = current[path[i]]
		}

		const lastKey = path[path.length - 1]

		if (!current[lastKey] || typeof current[lastKey] !== 'object') {
			return next(new ErrorHandler('Feature path not found', HTTP.NOT_FOUND))
		}

		if (typeof value === 'boolean') {
			current[lastKey][field] = value
		} else if (value === 'toggle') {
			current[lastKey][field] = !current[lastKey][field]
		} else {
			return next(new ErrorHandler('Invalid value type', HTTP.BAD_REQUEST))
		}

		await saveFeatureFlags(featureFlags)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: featureFlags,
			message: 'Feature updated successfully',
		})
	})
)

module.exports = router
