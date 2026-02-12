const express = require('express')
const router = express.Router()
const fs = require('fs')
const path = require('path')

const { Course } = require('../../../../models/common/content/course_model')
const { Session } = require('../../../../models/common/content/session_model')
const { Module } = require('../../../../models/common/content/module_model')
const superAdmin = require('../../../../middleware/superAdmin')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')
const { generateUniqueSlug } = require('../../../../utils/slugify')

// Path to sample data files
const DATA_DIR = path.join(__dirname, '../../../../data')
const COURSES_FILE = path.join(DATA_DIR, 'sample_courses.json')
const MODULES_FILE = path.join(DATA_DIR, 'sample_modules.json')
const SESSIONS_FILE = path.join(DATA_DIR, 'sample_sessions.json')

/**
 * Import sample course data from JSON files
 * This route will:
 * 1. Import courses
 * 2. Import modules and link them to courses
 * 3. Import sessions and link them to courses and modules
 * 4. Update courses with module and session references
 */
router.get(
	'/import-sample-data',
	catchAsyncError(async (req, res, next) => {
		// Check if files exist
		if (
			!fs.existsSync(COURSES_FILE) ||
			!fs.existsSync(MODULES_FILE) ||
			!fs.existsSync(SESSIONS_FILE)
		) {
			return next(
				new ErrorHandler(
					'Sample data files not found. Please ensure the JSON files exist in the data directory.',
					HTTP.NOT_FOUND
				)
			)
		}

		// Read JSON files
		let coursesData, modulesData, sessionsData
		try {
			coursesData = JSON.parse(fs.readFileSync(COURSES_FILE, 'utf8'))
			modulesData = JSON.parse(fs.readFileSync(MODULES_FILE, 'utf8'))
			sessionsData = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'))
		} catch (error) {
			return next(
				new ErrorHandler(
					`Error reading JSON files: ${error.message}`,
					HTTP.INTERNAL_SERVER_ERROR
				)
			)
		}

		// Validate data structure
		if (
			!Array.isArray(coursesData) ||
			!Array.isArray(modulesData) ||
			!Array.isArray(sessionsData)
		) {
			return next(
				new ErrorHandler(
					'Invalid JSON structure. Expected arrays for courses, modules, and sessions.',
					HTTP.BAD_REQUEST
				)
			)
		}

		const results = {
			courses: [],
			modules: [],
			sessions: [],
			errors: [],
		}

		// Step 1: Import Courses
		const courseIdMap = {} // Map to store course index -> course ID
		for (let i = 0; i < coursesData.length; i++) {
			const courseData = coursesData[i]
			try {
				// Check if course with same slug already exists
				const existingCourse = await Course.findOne({ slug: courseData.slug })
				if (existingCourse) {
					results.errors.push(
						`Course "${courseData.name.en}" (slug: ${courseData.slug}) already exists. Skipping.`
					)
					courseIdMap[i] = existingCourse._id
					results.courses.push({
						index: i,
						name: courseData.name.en,
						id: existingCourse._id,
						status: 'existing',
					})
					continue
				}

				// Generate unique slug if not provided
				let slug = courseData.slug
				if (!slug && courseData.name && courseData.name.en) {
					slug = await generateUniqueSlug(courseData.name.en, Course)
				} else if (slug) {
					slug = await generateUniqueSlug(slug, Course)
				}

				// Convert Map objects to actual Maps for Mongoose
				const course = new Course({
					...courseData,
					slug,
				})

				// Convert name, description, introVideo, introVideoTranscribe objects to Maps
				if (courseData.name && typeof courseData.name === 'object') {
					course.name = new Map(Object.entries(courseData.name))
				}
				if (
					courseData.description &&
					typeof courseData.description === 'object'
				) {
					course.description = new Map(Object.entries(courseData.description))
				}
				if (
					courseData.introVideo &&
					typeof courseData.introVideo === 'object'
				) {
					course.introVideo = new Map(Object.entries(courseData.introVideo))
				}
				if (
					courseData.introVideoTranscribe &&
					typeof courseData.introVideoTranscribe === 'object'
				) {
					course.introVideoTranscribe = new Map(
						Object.entries(courseData.introVideoTranscribe)
					)
				}

				await course.save()
				courseIdMap[i] = course._id
				results.courses.push({
					index: i,
					name: courseData.name.en,
					id: course._id,
					status: 'created',
				})
			} catch (error) {
				results.errors.push(
					`Error creating course "${courseData.name?.en || 'Unknown'}": ${error.message}`
				)
			}
		}

		// Step 2: Import Modules and link to courses
		// Course 1 (index 0) gets modules 0-2, Course 3 (index 2) gets modules 3-5
		const moduleIdMap = {} // Map to store module index -> module ID
		const courseModuleMap = {
			0: [0, 1, 2], // Course 1 -> Modules 0, 1, 2
			2: [3, 4, 5], // Course 3 -> Modules 3, 4, 5
		}

		for (let i = 0; i < modulesData.length; i++) {
			const moduleData = modulesData[i]
			try {
				// Find which course this module belongs to
				let courseId = null
				for (const [courseIndex, moduleIndices] of Object.entries(
					courseModuleMap
				)) {
					if (moduleIndices.includes(i)) {
						courseId = courseIdMap[parseInt(courseIndex)]
						break
					}
				}

				if (!courseId) {
					results.errors.push(
						`Module "${moduleData.name.en}" (index ${i}) has no assigned course. Skipping.`
					)
					continue
				}

				// Convert Map objects to actual Maps
				const module = new Module({
					...moduleData,
					course: courseId,
				})

				if (moduleData.name && typeof moduleData.name === 'object') {
					module.name = new Map(Object.entries(moduleData.name))
				}
				if (
					moduleData.description &&
					typeof moduleData.description === 'object'
				) {
					module.description = new Map(Object.entries(moduleData.description))
				}

				await module.save()
				moduleIdMap[i] = module._id
				results.modules.push({
					index: i,
					name: moduleData.name.en,
					id: module._id,
					courseId: courseId,
					status: 'created',
				})
			} catch (error) {
				results.errors.push(
					`Error creating module "${moduleData.name?.en || 'Unknown'}": ${error.message}`
				)
			}
		}

		// Step 3: Import Sessions and link to courses and modules
		// Session mapping:
		// Course 1: Sessions 0-2 (Session 0 -> Module 0, Session 1 -> Module 0, Session 2 -> Module 1)
		// Course 2: Sessions 3-4 (no modules)
		// Course 3: Sessions 5-7 (Session 5 -> Module 3, Session 6 -> Module 4, Session 7 -> Module 4)
		const sessionIdMap = {} // Map to store session index -> session ID
		const sessionMapping = [
			{ courseIndex: 0, moduleIndex: 0 }, // Session 0: Course 1, Module 0
			{ courseIndex: 0, moduleIndex: 0 }, // Session 1: Course 1, Module 0
			{ courseIndex: 0, moduleIndex: 1 }, // Session 2: Course 1, Module 1
			{ courseIndex: 1, moduleIndex: null }, // Session 3: Course 2, no module
			{ courseIndex: 1, moduleIndex: null }, // Session 4: Course 2, no module
			{ courseIndex: 2, moduleIndex: 3 }, // Session 5: Course 3, Module 3
			{ courseIndex: 2, moduleIndex: 4 }, // Session 6: Course 3, Module 4
			{ courseIndex: 2, moduleIndex: 4 }, // Session 7: Course 3, Module 4
		]

		for (let i = 0; i < sessionsData.length; i++) {
			const sessionData = sessionsData[i]
			const mapping = sessionMapping[i]

			if (!mapping) {
				results.errors.push(
					`Session "${sessionData.name.en}" (index ${i}) has no mapping. Skipping.`
				)
				continue
			}

			try {
				const courseId = courseIdMap[mapping.courseIndex]
				if (!courseId) {
					results.errors.push(
						`Session "${sessionData.name.en}" (index ${i}) has invalid course mapping. Skipping.`
					)
					continue
				}

				const moduleId =
					mapping.moduleIndex !== null ? moduleIdMap[mapping.moduleIndex] : null

				// Convert Map objects to actual Maps
				const session = new Session({
					...sessionData,
					courseId: courseId,
					moduleId: moduleId,
				})

				// Convert all Map fields
				if (sessionData.name && typeof sessionData.name === 'object') {
					session.name = new Map(Object.entries(sessionData.name))
				}
				if (
					sessionData.description &&
					typeof sessionData.description === 'object'
				) {
					session.description = new Map(Object.entries(sessionData.description))
				}
				if (sessionData.video && typeof sessionData.video === 'object') {
					session.video = new Map(Object.entries(sessionData.video))
				}
				if (
					sessionData.attachment &&
					typeof sessionData.attachment === 'object'
				) {
					session.attachment = new Map(Object.entries(sessionData.attachment))
				}
				if (sessionData.duration && typeof sessionData.duration === 'object') {
					session.duration = new Map(Object.entries(sessionData.duration))
				}
				if (
					sessionData.transcribe &&
					typeof sessionData.transcribe === 'object'
				) {
					session.transcribe = new Map(Object.entries(sessionData.transcribe))
				}
				if (sessionData.quiz && typeof sessionData.quiz === 'object') {
					session.quiz = new Map(Object.entries(sessionData.quiz))
				}
				if (sessionData.hls && typeof sessionData.hls === 'object') {
					// HLS is a Map of sub-schemas, so we need to handle it differently
					const hlsMap = new Map()
					for (const [lang, hlsData] of Object.entries(sessionData.hls)) {
						hlsMap.set(lang, hlsData)
					}
					session.hls = hlsMap
				}

				await session.save()
				sessionIdMap[i] = session._id
				results.sessions.push({
					index: i,
					name: sessionData.name.en,
					id: session._id,
					courseId: courseId,
					moduleId: moduleId,
					status: 'created',
				})
			} catch (error) {
				results.errors.push(
					`Error creating session "${sessionData.name?.en || 'Unknown'}": ${error.message}`
				)
			}
		}

		// Step 4: Update Courses with module and session references
		for (let i = 0; i < coursesData.length; i++) {
			const courseId = courseIdMap[i]
			if (!courseId) continue

			try {
				const course = await Course.findById(courseId)
				if (!course) continue

				// Get modules for this course
				const moduleIndices = courseModuleMap[i] || []
				const moduleIds = moduleIndices
					.map((idx) => moduleIdMap[idx])
					.filter((id) => id !== undefined)

				// Get sessions for this course
				const sessionIndices = sessionMapping
					.map((mapping, idx) => (mapping.courseIndex === i ? idx : null))
					.filter((idx) => idx !== null)
				const sessionIds = sessionIndices
					.map((idx) => sessionIdMap[idx])
					.filter((id) => id !== undefined)

				// Update course with module and session references
				course.modules = moduleIds
				course.sessions = sessionIds
				await course.save()
			} catch (error) {
				results.errors.push(
					`Error updating course references for course index ${i}: ${error.message}`
				)
			}
		}

		// Step 5: Update Modules with session references
		for (let i = 0; i < modulesData.length; i++) {
			const moduleId = moduleIdMap[i]
			if (!moduleId) continue

			try {
				const module = await Module.findById(moduleId)
				if (!module) continue

				// Find sessions for this module
				const sessionIndices = sessionMapping
					.map((mapping, idx) => (mapping.moduleIndex === i ? idx : null))
					.filter((idx) => idx !== null)
				const sessionIds = sessionIndices
					.map((idx) => sessionIdMap[idx])
					.filter((id) => id !== undefined)

				module.sessions = sessionIds
				await module.save()
			} catch (error) {
				results.errors.push(
					`Error updating module references for module index ${i}: ${error.message}`
				)
			}
		}

		// Prepare summary
		const summary = {
			coursesCreated: results.courses.filter((c) => c.status === 'created')
				.length,
			coursesExisting: results.courses.filter((c) => c.status === 'existing')
				.length,
			modulesCreated: results.modules.length,
			sessionsCreated: results.sessions.length,
			errors: results.errors.length,
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				summary,
				details: {
					courses: results.courses,
					modules: results.modules,
					sessions: results.sessions,
					errors: results.errors,
				},
			},
			message: `Sample data imported successfully. ${summary.coursesCreated} courses, ${summary.modulesCreated} modules, and ${summary.sessionsCreated} sessions created.`,
		})
	})
)

module.exports = router
