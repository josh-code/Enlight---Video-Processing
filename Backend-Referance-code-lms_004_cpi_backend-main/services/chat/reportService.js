const UserReport = require('../../models/common/user_report_model')
const Message = require('../../models/common/messages_model')
const conversationService = require('./conversationService')

/**
 * Report Service
 * Handles user reporting logic
 */

/**
 * Create a user report
 * @param {string} reporterId - User ID reporting
 * @param {string} reportedUserId - User ID being reported
 * @param {string} reason - Report reason
 * @param {string} comment - Optional comment
 * @returns {Promise<Object>} - Created report
 */
async function createReport(reporterId, reportedUserId, reason, comment = '') {
	try {
		// Get conversation between users
		const conversation =
			await conversationService.findOrCreateDirectConversation(
				reporterId,
				reportedUserId
			)

		// Get last 5 messages for context
		const contextMessages = await Message.find({
			conversation: conversation._id,
		})
			.sort({ createdAt: -1 })
			.limit(5)
			.select('sender content message createdAt')
			.populate('sender', 'firstName lastName')

		// Create the report
		const report = new UserReport({
			reporter: reporterId,
			reportedUser: reportedUserId,
			reason,
			comment: comment || '',
			contextMessages: contextMessages.map((msg) => ({
				sender: msg.sender._id,
				message: msg.content || msg.message,
				createdAt: msg.createdAt,
			})),
		})

		await report.save()

		return report
	} catch (error) {
		console.error('Error creating report:', error)
		throw error
	}
}

module.exports = {
	createReport,
}
