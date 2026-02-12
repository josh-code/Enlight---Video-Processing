const express = require('express')
const { Module } = require('../../../../models/common/content/module_model')
const router = express.Router()
const auth = require('../../../../middleware/auth')
const superAdmin = require('../../../../middleware/superAdmin')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const { Course } = require('../../../../models/common/content/course_model')
const { Session } = require('../../../../models/common/content/session_model')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

// Create moduel
router.post(
	'/createModule',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { moduleId, name, description, courseId } = req.body

		if (moduleId) {
			// If `moduleId` is provided, update the existing module
			const module = await Module.findById(moduleId)

			if (!module) {
				return next(new ErrorHandler('Module not found.', HTTP.NOT_FOUND))
			}

			// Update fields conditionally
			const updateObj = {}

			// Update name if provided
			if (name && typeof name === 'object') {
				if (name.en !== undefined) updateObj['name.en'] = name.en
				if (name.es !== undefined) updateObj['name.es'] = name.es
			}

			// Update description if provided
			if (description && typeof description === 'object') {
				if (description.en !== undefined)
					updateObj['description.en'] = description.en
				if (description.es !== undefined)
					updateObj['description.es'] = description.es
			}

			if (courseId) {
				const course = await Course.findById(courseId).lean()
				if (!course) {
					return next(new ErrorHandler('Course not found.', HTTP.BAD_REQUEST))
				}

				updateObj.course = courseId

				// Ensure the module is associated with the course if modular
				if (course.isModular && !course.modules.includes(module._id)) {
					await Course.findByIdAndUpdate(
						courseId,
						{ $addToSet: { modules: module._id } },
						{ lean: true }
					)
				}
			}

			const updatedModule = await Module.findByIdAndUpdate(
				moduleId,
				updateObj,
				{
					new: true,
				}
			)
			return sendResponse({
				res,
				status: true,
				code: HTTP.OK,
				data: updatedModule,
				message: 'Module updated successfully',
			})
		} else {
			if (!courseId) {
				return next(
					new ErrorHandler(
						'Course ID is required for creating a new module.',
						HTTP.BAD_REQUEST
					)
				)
			}

			const course = await Course.findById(courseId).lean()
			if (!course) {
				return next(new ErrorHandler('Course not found.', HTTP.BAD_REQUEST))
			}

			// Validate that name.en is present
			if (!name || typeof name !== 'object' || !name.en) {
				return next(
					new ErrorHandler('Module name.en is required.', HTTP.BAD_REQUEST)
				)
			}

			const lastModule = await Module.findOne({ course: courseId })
				.sort({ index: -1 })
				.lean()
			const index = lastModule ? lastModule.index + 1 : 0

			const newModuleData = {
				course: courseId,
				index,
				name: {
					en: name.en,
					es: name.es || '',
				},
				description: {
					en: (description && description.en) || '',
					es: (description && description.es) || '',
				},
			}

			const module = await Module.create(newModuleData)

			if (course.isModular) {
				await Course.findByIdAndUpdate(
					courseId,
					{ $push: { modules: module._id } },
					{ lean: true }
				)
			}

			return sendResponse({
				res,
				status: true,
				code: HTTP.CREATED,
				data: module,
				message: 'Module created successfully',
			})
		}
	})
)

// Get all moduels
router.get(
	'/getModules',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { courseId } = req.query

		if (!courseId)
			return next(new ErrorHandler('Course id is required', HTTP.BAD_REQUEST))

		const course = await Course.findById(courseId)

		if (!course)
			return next(new ErrorHandler('Course not found', HTTP.BAD_REQUEST))

		const modules = await Module.find({ _id: { $in: course.modules } })
			.populate({
				path: 'sessions',
				options: { sort: { index: 1 } },
			})
			.sort({ index: 1 })
			.lean()

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: modules,
			message: 'Modules fetched successfully',
		})
	})
)

// Route to update module order
router.post(
	'/updateModuleOrder',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { courseId, moduleOrder } = req.body

		const bulkUpdates = moduleOrder.map((moduleId, index) => ({
			updateOne: {
				filter: { _id: moduleId, course: courseId },
				update: { index },
			},
		}))

		await Module.bulkWrite(bulkUpdates)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Module order updated successfully',
		})
	})
)

// Get moduel by id
router.get(
	'/getModuleById',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { moduleId, courseId } = req.query

		if (!moduleId)
			return next(new ErrorHandler('Module id is required', HTTP.BAD_REQUEST))

		const module = await Module.findById(moduleId)

		if (!module)
			return next(new ErrorHandler('Module not found', HTTP.BAD_REQUEST))

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: module,
			message: 'Module fetched successfully',
		})
	})
)

// delete moduel by id
router.delete(
	'/deleteModuleById',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { moduleId, courseId } = req.query

		if (!moduleId)
			return next(new ErrorHandler('Module id is required', HTTP.BAD_REQUEST))
		if (!courseId)
			return next(new ErrorHandler('Course id is required', HTTP.BAD_REQUEST))

		const course = await Course.findById(courseId)
		if (!course)
			return next(new ErrorHandler('Course not found', HTTP.BAD_REQUEST))
		if (!course.isModular)
			return next(new ErrorHandler('Course is not modular', HTTP.BAD_REQUEST))

		const module = await Module.findOne({
			_id: moduleId,
			course: courseId,
		})
		if (!module) {
			return next(
				new ErrorHandler(
					'Module not found or does not belong to the specified course',
					HTTP.BAD_REQUEST
				)
			)
		}

		await Session.deleteMany({ moduleId: moduleId })
		await Course.findByIdAndUpdate(courseId, { $pull: { modules: moduleId } })
		await Module.findByIdAndDelete(moduleId)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Module and its dependent sessions deleted successfully',
		})
	})
)

// update module by id
router.put(
	'/updateModuleById',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { moduleName, moduleId, courseId } = req.body

		if (!moduleId)
			return next(new ErrorHandler('Module id is required', HTTP.BAD_REQUEST))
		if (!courseId)
			return next(new ErrorHandler('Course id is required', HTTP.BAD_REQUEST))

		const module = await Module.findOne({ _id: moduleId, course: courseId })

		if (!module)
			return next(new ErrorHandler('Module not found', HTTP.BAD_REQUEST))

		module.name = moduleName
		await module.save()

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Module updated successfully',
		})
	})
)

module.exports = router
