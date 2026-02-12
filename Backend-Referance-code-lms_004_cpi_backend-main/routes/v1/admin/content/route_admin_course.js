const express = require('express')
const router = express.Router()

const {
	Course,
	courseValidation,
} = require('../../../../models/common/content/course_model')
const { Session } = require('../../../../models/common/content/session_model')
const { Module } = require('../../../../models/common/content/module_model')
const superAdmin = require('../../../../middleware/superAdmin')
const {
	UserProgress,
} = require('../../../../models/app/content/user_progress_model')
const {
	deleteAwsObject,
	deleteHLSFiles,
} = require('../../../../services/aws/utils')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')
const {
	getPaginationParams,
	buildPaginatedResponse,
} = require('../../../../utils/pagination')
const { generateUniqueSlug } = require('../../../../utils/slugify')

router.get(
	'/getCourses',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const match = {}

		// Handle query parameters
		if (req.query.isDraft) {
			match.isDraft = req.query.isDraft === 'true'
		}

		// Sorting
		let sort = {}
		if (req.query.sortField) {
			const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1
			sort[req.query.sortField] = sortOrder
		} else {
			sort = { index: 1 }
		}

		// Get total count for pagination
		const total = await Course.countDocuments(match)

		// Get pagination params
		const { page, limit, skip } = getPaginationParams(req.query)

		// Aggregation pipeline
		const pipeline = [
			{ $match: match },
			{
				$lookup: {
					from: 'sessions',
					localField: '_id',
					foreignField: 'courseId',
					as: 'sessions',
				},
			},
			{
				$addFields: {
					sessionCount: { $size: '$sessions' },
				},
			},
			{
				$project: {
					sessions: 0,
				},
			},
			{ $sort: sort },
			{ $skip: skip },
			{ $limit: limit },
		]

		const courses = await Course.aggregate(pipeline)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: buildPaginatedResponse(courses, page, limit, total, 'courses'),
			message: 'Courses fetched successfully',
		})
	})
)

router.get(
	'/:id',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const course = await Course.findById(req.params.id)

		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: course,
			message: 'Course fetched successfully',
		})
	})
)

router.post(
	'/',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { error: validationError } = courseValidation(req.body, false)
		if (validationError) {
			return next(
				new ErrorHandler(validationError.details[0].message, HTTP.BAD_REQUEST)
			)
		}

		const existingCourse = await Course.findOne({
			'name.en': req.body.name.en,
		})
		if (existingCourse) {
			return next(
				new ErrorHandler('Course with this name already exists', HTTP.CONFLICT)
			)
		}

		// Generate unique slug from course name if not provided
		let slug = req.body.slug
		if (!slug && req.body.name && req.body.name.en) {
			slug = await generateUniqueSlug(req.body.name.en, Course)
		} else if (slug) {
			// If slug is provided, ensure it's unique
			slug = await generateUniqueSlug(slug, Course)
		} else {
			return next(
				new ErrorHandler(
					'Course name is required to generate slug',
					HTTP.BAD_REQUEST
				)
			)
		}

		// Get the highest index among existing courses using aggregation
		const highestIndexResult = await Course.aggregate([
			{
				$sort: { index: -1 },
			},
			{
				$limit: 1,
			},
			{
				$project: {
					index: 1,
				},
			},
		])

		const newIndex =
			highestIndexResult.length > 0 && highestIndexResult[0].index !== undefined
				? highestIndexResult[0].index + 1
				: 0

		const course = new Course({
			...req.body,
			slug,
			isDraft: true,
			index: newIndex,
		})

		await course.save()

		return sendResponse({
			res,
			status: true,
			code: HTTP.CREATED,
			data: course,
			message: 'Course created successfully',
		})
	})
)

router.put(
	'/changeCourseStructure',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { courseId, isModular } = req.body

		if (!courseId) {
			return next(new ErrorHandler('Course ID is required', HTTP.BAD_REQUEST))
		}

		const course = await Course.findById(courseId)
		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
		}

		course.isModular = isModular
		await course.save()

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: course,
			message: 'Course structure changed successfully',
		})
	})
)

router.put(
	'/toggleDraftStatus',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { courseId, isDraft } = req.body

		if (!courseId) {
			return next(new ErrorHandler('Course ID is required', HTTP.BAD_REQUEST))
		}

		const course = await Course.findById(courseId)
		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
		}

		course.isDraft = isDraft
		await course.save()

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: course,
			message: isDraft
				? 'Course moved to draft'
				: 'Course published successfully',
		})
	})
)

router.post(
	'/updateCourseOrder',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { semesterId, courseOrder } = req.body

		if (!courseOrder || !Array.isArray(courseOrder)) {
			return next(
				new ErrorHandler('Course order is required', HTTP.BAD_REQUEST)
			)
		}

		// Update the index of each course
		const bulkOps = courseOrder.map((courseId, index) => ({
			updateOne: {
				filter: { _id: courseId },
				update: { $set: { index } },
			},
		}))

		await Course.bulkWrite(bulkOps)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Course order updated successfully',
		})
	})
)

router.delete(
	'/:id',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const course = await Course.findById(req.params.id)

		if (!course) {
			return next(new ErrorHandler('Course not found', HTTP.NOT_FOUND))
		}

		// Get all sessions for this course
		const sessions = await Session.find({ courseId: req.params.id })

		// Delete all related files from S3
		for (const session of sessions) {
			// Delete video files
			if (session.video) {
				for (const [lang, key] of Object.entries(session.video)) {
					if (key) {
						await deleteAwsObject(key)
					}
				}
			}

			// Delete HLS files
			if (session.hlsVideoKey) {
				for (const [lang, key] of Object.entries(session.hlsVideoKey)) {
					if (key) {
						await deleteHLSFiles(key)
					}
				}
			}
		}

		// Delete course image if exists
		if (course.image) {
			await deleteAwsObject(course.image)
		}

		// Delete all sessions for this course
		await Session.deleteMany({ courseId: req.params.id })

		// Delete all modules for this course
		await Module.deleteMany({ courseId: req.params.id })

		// Delete user progress for this course's sessions
		const sessionIds = sessions.map((s) => s._id.toString())
		await UserProgress.updateMany(
			{},
			{ $pull: { progress: { _id: { $in: sessionIds } } } }
		)

		// Delete the course
		await Course.findByIdAndDelete(req.params.id)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Course and all related content deleted successfully',
		})
	})
)

module.exports = router
