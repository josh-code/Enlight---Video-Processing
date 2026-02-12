const express = require('express')
const router = express.Router()
const superAdmin = require('../../../middleware/superAdmin')
const UserReport = require('../../../models/common/user_report_model')
const UserBlock = require('../../../models/common/user_block_model')
const Message = require('../../../models/common/messages_model')
const Conversation = require('../../../models/common/conversation_model')
const { User } = require('../../../models/app/user_model')
const mongoose = require('mongoose')
const sendMail = require('../../../services/mail')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')
const {
	getPaginationParams,
	buildPaginatedResponse,
} = require('../../../utils/pagination')
const blockingService = require('../../../services/chat/blockingService')
const socketEmitter = require('../../../services/chat/socketEmitter')
const conversationService = require('../../../services/chat/conversationService')

// Get all reports with pagination and filtering
router.get(
	'/getAllReports',
	[superAdmin],
	catchAsyncError(async (req, res) => {
		const {
			status,
			reason,
			search,
			sortBy = 'createdAt',
			sortOrder = 'desc',
		} = req.query

		const { page, limit, skip } = getPaginationParams(req.query)
		const sortOptions = {}
		sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1

		// Build filter object
		const filter = {}
		if (status) {
			filter.status = status
		}
		if (reason) {
			filter.reason = reason
		}

		let reports
		let totalReports

		// Add search functionality
		if (search) {
			const searchRegex = new RegExp(search, 'i')

			// First, find users that match the search criteria
			const matchingUsers = await User.find({
				$or: [
					{ firstName: searchRegex },
					{ lastName: searchRegex },
					{ email: searchRegex },
				],
			}).select('_id')

			const matchingUserIds = matchingUsers.map((user) => user._id)

			// Build search filter
			const searchFilter = {
				...filter,
				$or: [
					{ reporter: { $in: matchingUserIds } },
					{ reportedUser: { $in: matchingUserIds } },
					{ reason: searchRegex },
					{ status: searchRegex },
					{ comment: searchRegex },
				],
			}

			reports = await UserReport.find(searchFilter)
				.populate('reporter', 'firstName lastName email')
				.populate('reportedUser', 'firstName lastName email')
				.populate('reviewedBy', 'firstName lastName email')
				.sort(sortOptions)
				.skip(skip)
				.limit(parseInt(limit))

			totalReports = await UserReport.countDocuments(searchFilter)
		} else {
			reports = await UserReport.find(filter)
				.populate('reporter', 'firstName lastName email')
				.populate('reportedUser', 'firstName lastName email')
				.populate('reviewedBy', 'firstName lastName email')
				.sort(sortOptions)
				.skip(skip)
				.limit(parseInt(limit))

			totalReports = await UserReport.countDocuments(filter)
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: buildPaginatedResponse(
				reports,
				page,
				limit,
				totalReports,
				'reports'
			),
			message: 'Reports fetched successfully',
		})
	})
)

// Get report details by ID
router.get(
	'/getReport/:reportId',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { reportId } = req.params

		const report = await UserReport.findById(reportId)
			.populate('reporter', 'firstName lastName email phone')
			.populate('reportedUser', 'firstName lastName email phone')
			.populate('reviewedBy', 'firstName lastName email')
			.populate({
				path: 'contextMessages.sender',
				select: 'firstName lastName email',
			})

		if (!report) {
			return next(new ErrorHandler('Report not found', HTTP.NOT_FOUND))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: report,
			message: 'Report fetched successfully',
		})
	})
)

// Update report status
router.put(
	'/updateReportStatus/:reportId',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { reportId } = req.params
		const { status, adminNotes } = req.body
		const adminId = req.user._id

		const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed']
		if (!validStatuses.includes(status)) {
			return next(new ErrorHandler('Invalid status', HTTP.BAD_REQUEST))
		}

		const updateData = {
			status,
			reviewedBy: adminId,
			reviewedAt: new Date(),
		}

		if (adminNotes) {
			updateData.adminNotes = adminNotes
		}

		if (status === 'resolved') {
			updateData.resolvedAt = new Date()
		}

		const report = await UserReport.findByIdAndUpdate(reportId, updateData, {
			new: true,
		})
			.populate('reporter', 'firstName lastName email')
			.populate('reportedUser', 'firstName lastName email')

		if (!report) {
			return next(new ErrorHandler('Report not found', HTTP.NOT_FOUND))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: report,
			message: 'Report status updated successfully',
		})
	})
)

// Get report statistics
router.get(
	'/getReportStats',
	[superAdmin],
	catchAsyncError(async (req, res) => {
		const stats = await UserReport.aggregate([
			{
				$group: {
					_id: '$status',
					count: { $sum: 1 },
				},
			},
		])

		const reasonStats = await UserReport.aggregate([
			{
				$group: {
					_id: '$reason',
					count: { $sum: 1 },
				},
			},
		])

		const totalReports = await UserReport.countDocuments()
		const recentReports = await UserReport.countDocuments({
			createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
		})

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				statusStats: stats,
				reasonStats,
				totalReports,
				recentReports,
			},
			message: 'Report statistics fetched successfully',
		})
	})
)

// Block user from chat functionality (admin action)
router.post(
	'/blockUserFromChat/:userId',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { userId } = req.params
		const { reason, adminNotes } = req.body
		const adminId = req.user._id

		// Check if user exists
		const user = await User.findById(userId)
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		// Use blocking service for admin block
		const result = await blockingService.adminBlockUser(
			adminId,
			userId,
			reason || 'Blocked from chat due to report'
		)

		// Update all conversations involving this user to blocked status
		const conversations = await Conversation.find({
			participants: userId,
		})

		for (const conversation of conversations) {
			await conversationService.blockConversation(
				conversation._id.toString(),
				adminId
			)
		}

		// Update all messages involving this user to blocked status (legacy)
		await Message.updateMany(
			{
				$or: [{ sender: userId }, { receiver: userId }],
			},
			{
				conversationStatus: 'blocked',
				blockedBy: adminId,
			}
		)

		// Emit socket event
		socketEmitter.emitUserAdminBlocked(userId)

		// Send email notification to the user
		sendMail({
			subject: 'Chat Access Update - Church Planting Institute',
			send_to: user.email,
			template: 'chat-access-restriction',
			context: {
				userName: `${user.firstName} ${user.lastName}`,
				reason: reason || 'Blocked from chat due to report',
				year: new Date().getFullYear(),
			},
		})
			.then(() => {
				console.log('Chat restriction email sent successfully to:', user.email)
			})
			.catch((err) => {
				console.error('Failed to send chat restriction email:', err)
			})

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				affectedReports: result.affectedReports,
				affectedUsers: result.affectedUsers,
				user: {
					_id: user._id,
					firstName: user.firstName,
					lastName: user.lastName,
					email: user.email,
				},
			},
			message: 'User blocked from chat successfully',
		})
	})
)

// Unblock user from chat functionality (admin action)
router.post(
	'/unblockUserFromChat/:userId',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const { userId } = req.params
		const adminId = req.user._id

		// Check if user exists
		const user = await User.findById(userId)
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		// Use blocking service for admin unblock
		const result = await blockingService.adminUnblockUser(adminId, userId)

		// Update all conversations involving this user to active status
		const conversations = await Conversation.find({
			participants: userId,
			status: 'blocked',
			blockedBy: adminId,
		})

		for (const conversation of conversations) {
			// Only unblock if it was blocked by admin
			if (conversation.blockedBy?.toString() === adminId.toString()) {
				await conversationService.unblockConversation(
					conversation._id.toString(),
					adminId
				)
			}
		}

		// Update all messages involving this user to accepted status (legacy)
		await Message.updateMany(
			{
				$or: [{ sender: userId }, { receiver: userId }],
			},
			{
				conversationStatus: 'accepted',
				blockedBy: null,
			}
		)

		// Emit socket event
		socketEmitter.emitUserAdminUnblocked(userId)

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				affectedReports: result.affectedReports,
				affectedBlocks: result.affectedBlocks,
				user: {
					_id: user._id,
					firstName: user.firstName,
					lastName: user.lastName,
					email: user.email,
				},
			},
			message: 'User unblocked from chat successfully',
		})
	})
)

// Get chat blocked users list
router.get(
	'/getChatBlockedUsers',
	[superAdmin],
	catchAsyncError(async (req, res) => {
		const { page, limit, skip } = getPaginationParams(req.query)

		// Get users who are blocked from chat
		const chatBlockedUsers = await UserReport.aggregate([
			{
				$match: {
					chatBlockStatus: 'blocked',
				},
			},
			{
				$lookup: {
					from: 'users',
					localField: 'reportedUser',
					foreignField: '_id',
					as: 'user',
				},
			},
			{
				$unwind: '$user',
			},
			{
				$lookup: {
					from: 'users',
					localField: 'chatBlockedBy',
					foreignField: '_id',
					as: 'blockedBy',
				},
			},
			{
				$unwind: '$blockedBy',
			},
			{
				$group: {
					_id: '$reportedUser',
					user: { $first: '$user' },
					blockedBy: { $first: '$blockedBy' },
					chatBlockedAt: { $first: '$chatBlockedAt' },
					chatBlockReason: { $first: '$chatBlockReason' },
					reportCount: { $sum: 1 },
				},
			},
			{
				$project: {
					_id: '$user._id',
					firstName: '$user.firstName',
					lastName: '$user.lastName',
					email: '$user.email',
					blockedBy: {
						firstName: '$blockedBy.firstName',
						lastName: '$blockedBy.lastName',
						email: '$blockedBy.email',
					},
					chatBlockedAt: 1,
					chatBlockReason: 1,
					reportCount: 1,
				},
			},
			{
				$sort: { chatBlockedAt: -1 },
			},
			{
				$skip: skip,
			},
			{
				$limit: parseInt(limit),
			},
		])

		const totalChatBlocked = await UserReport.countDocuments({
			chatBlockStatus: 'blocked',
		})

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: buildPaginatedResponse(
				chatBlockedUsers,
				page,
				limit,
				totalChatBlocked,
				'chatBlockedUsers'
			),
			message: 'Chat blocked users fetched successfully',
		})
	})
)

module.exports = router
