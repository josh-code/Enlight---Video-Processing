const { Router } = require('express')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const { Subscription } = require('../../../models//app/subscription_model')
const { User } = require('../../../models/app/user_model')
const sendResponse = require('../../../utils/sendResponse')
const ErrorHandler = require('../../../utils/errorHandler')
const HTTP = require('../../../constants/httpStatus')
const { formatCurrency } = require('../../../utils/currency')
const {
	getPaginationParams,
	buildPaginatedResponse,
} = require('../../../utils/pagination')
const stripeService = require('../../../services/stripe/stripeService')
const superAdmin = require('../../../middleware/superAdmin')
const router = Router()

// List all subscriptions with filters
router.get(
	'/list',
	superAdmin,
	catchAsyncError(async (req, res, next) => {
		const query = {}

		// Filter by status
		if (req.query.status) {
			query.status = req.query.status
		}

		// Filter by plan
		if (req.query.plan) {
			query.plan = req.query.plan
		}

		// Search by user email or name
		if (req.query.search) {
			const searchTerm = req.query.search
			const users = await User.find({
				$or: [
					{ email: { $regex: searchTerm, $options: 'i' } },
					{ firstName: { $regex: searchTerm, $options: 'i' } },
					{ lastName: { $regex: searchTerm, $options: 'i' } },
				],
			}).select('_id')
			const userIds = users.map((u) => u._id)
			query.userId = { $in: userIds }
		}

		// Date range filter
		if (req.query.startDate || req.query.endDate) {
			query.createdAt = {}
			if (req.query.startDate) {
				query.createdAt.$gte = new Date(req.query.startDate)
			}
			if (req.query.endDate) {
				query.createdAt.$lte = new Date(req.query.endDate)
			}
		}

		// Get pagination parameters using utility
		const { page, limit, skip } = getPaginationParams(req.query, {
			page: 1,
			limit: 20,
			maxLimit: 100,
		})

		// Sort
		const sortField = req.query.sortField || 'createdAt'
		const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1
		const sort = { [sortField]: sortOrder }

		// Fetch subscriptions and total count
		const [subscriptions, total] = await Promise.all([
			Subscription.find(query)
				.populate('userId', 'firstName lastName email phone')
				.sort(sort)
				.skip(skip)
				.limit(limit)
				.lean(),
			Subscription.countDocuments(query),
		])

		// Format subscriptions
		const formattedSubscriptions = subscriptions.map((sub) => ({
			_id: sub._id,
			user: sub.userId
				? {
						_id: sub.userId._id,
						name: `${sub.userId.firstName || ''} ${sub.userId.lastName || ''}`.trim(),
						email: sub.userId.email,
						phone: sub.userId.phone,
					}
				: null,
			status: sub.status,
			plan: sub.plan,
			amount: sub.amount,
			currency: sub.currency,
			formattedAmount: formatCurrency(sub.amount, sub.currency),
			currentPeriodStart: sub.currentPeriodStart,
			currentPeriodEnd: sub.currentPeriodEnd,
			cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
			totalPaid: sub.totalPaid,
			invoiceCount: sub.invoiceCount,
			createdAt: sub.createdAt,
			updatedAt: sub.updatedAt,
		}))

		// Build paginated response using utility
		const responseData = buildPaginatedResponse(
			formattedSubscriptions,
			page,
			limit,
			total,
			'subscriptions'
		)

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: responseData,
			message: 'Subscriptions retrieved successfully',
		})
	})
)

// Get subscription details
router.get(
	'/:id',
	superAdmin,
	catchAsyncError(async (req, res, next) => {
		const { id } = req.params

		const subscription = await Subscription.findById(id)
			.populate('userId', 'firstName lastName email phone country timeZone')
			.lean()

		if (!subscription) {
			return next(new ErrorHandler('Subscription not found', HTTP.NOT_FOUND))
		}

		// Fetch payment history from Stripe
		let invoices = []
		try {
			const stripeInvoices = await stripeService.listInvoices({
				subscription: subscription.stripeSubscriptionId,
				limit: 10,
			})
			invoices = stripeInvoices.data
		} catch (error) {
			console.error('Error fetching invoices:', error)
		}

		// Format subscription
		const formattedSubscription = {
			_id: subscription._id,
			user: subscription.userId
				? {
						_id: subscription.userId._id,
						name: `${subscription.userId.firstName || ''} ${subscription.userId.lastName || ''}`.trim(),
						email: subscription.userId.email,
						phone: subscription.userId.phone,
						country: subscription.userId.country,
						timeZone: subscription.userId.timeZone,
					}
				: null,
			stripeSubscriptionId: subscription.stripeSubscriptionId,
			stripeCustomerId: subscription.stripeCustomerId,
			status: subscription.status,
			plan: subscription.plan,
			priceId: subscription.priceId,
			amount: subscription.amount,
			currency: subscription.currency,
			formattedAmount: formatCurrency(
				subscription.amount,
				subscription.currency
			),
			currentPeriodStart: subscription.currentPeriodStart,
			currentPeriodEnd: subscription.currentPeriodEnd,
			cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
			canceledAt: subscription.canceledAt,
			cancellationReason: subscription.cancellationReason,
			totalPaid: subscription.totalPaid,
			invoiceCount: subscription.invoiceCount,
			trialStart: subscription.trialStart,
			trialEnd: subscription.trialEnd,
			invoices: invoices,
			createdAt: subscription.createdAt,
			updatedAt: subscription.updatedAt,
		}

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: formattedSubscription,
			message: 'Subscription details retrieved successfully',
		})
	})
)

// Get subscription statistics
router.get(
	'/stats',
	superAdmin,
	catchAsyncError(async (req, res, next) => {
		// Active subscribers count
		const activeSubscribers = await Subscription.countDocuments({
			status: { $in: ['active', 'trialing'] },
		})

		// Total subscribers (all time)
		const totalSubscribers = await Subscription.countDocuments({})

		// Canceled subscriptions
		const canceledSubscriptions = await Subscription.countDocuments({
			status: 'canceled',
		})

		// Past due subscriptions
		const pastDueSubscriptions = await Subscription.countDocuments({
			status: 'past_due',
		})

		// Calculate MRR (Monthly Recurring Revenue)
		const activeSubs = await Subscription.find({
			status: { $in: ['active', 'trialing'] },
		}).lean()

		let mrr = 0
		activeSubs.forEach((sub) => {
			if (sub.plan === 'monthly') {
				mrr += sub.amount
			} else if (sub.plan === 'yearly') {
				// Convert yearly to monthly equivalent
				mrr += sub.amount / 12
			}
		})

		// Revenue by plan type
		const monthlySubs = await Subscription.find({
			status: { $in: ['active', 'trialing'] },
			plan: 'monthly',
		}).lean()
		const yearlySubs = await Subscription.find({
			status: { $in: ['active', 'trialing'] },
			plan: 'yearly',
		}).lean()

		const monthlyRevenue = monthlySubs.reduce((sum, sub) => sum + sub.amount, 0)
		const yearlyRevenue = yearlySubs.reduce((sum, sub) => sum + sub.amount, 0)

		// Churn rate (canceled / total)
		const churnRate =
			totalSubscribers > 0
				? ((canceledSubscriptions / totalSubscribers) * 100).toFixed(2)
				: 0

		// Recent subscriptions (last 30 days)
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
		const recentSubscriptions = await Subscription.countDocuments({
			createdAt: { $gte: thirtyDaysAgo },
		})

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				activeSubscribers,
				totalSubscribers,
				canceledSubscriptions,
				pastDueSubscriptions,
				mrr: Math.round(mrr), // MRR in cents
				mrrFormatted: formatCurrency(Math.round(mrr), 'usd'),
				monthlyRevenue: Math.round(monthlyRevenue),
				monthlyRevenueFormatted: formatCurrency(
					Math.round(monthlyRevenue),
					'usd'
				),
				yearlyRevenue: Math.round(yearlyRevenue),
				yearlyRevenueFormatted: formatCurrency(
					Math.round(yearlyRevenue),
					'usd'
				),
				churnRate: parseFloat(churnRate),
				recentSubscriptions,
				planBreakdown: {
					monthly: monthlySubs.length,
					yearly: yearlySubs.length,
				},
			},
			message: 'Subscription statistics retrieved successfully',
		})
	})
)

// Get user's subscription history
router.get(
	'/user/:userId',
	superAdmin,
	catchAsyncError(async (req, res, next) => {
		const { userId } = req.params

		const user = await User.findById(userId)
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		const subscriptions = await Subscription.find({ userId })
			.sort({ createdAt: -1 })
			.lean()

		// Format subscriptions
		const formattedSubscriptions = subscriptions.map((sub) => ({
			_id: sub._id,
			status: sub.status,
			plan: sub.plan,
			amount: sub.amount,
			currency: sub.currency,
			formattedAmount: formatCurrency(sub.amount, sub.currency),
			currentPeriodStart: sub.currentPeriodStart,
			currentPeriodEnd: sub.currentPeriodEnd,
			cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
			canceledAt: sub.canceledAt,
			totalPaid: sub.totalPaid,
			invoiceCount: sub.invoiceCount,
			createdAt: sub.createdAt,
			updatedAt: sub.updatedAt,
		}))

		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: {
				user: {
					_id: user._id,
					name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
					email: user.email,
				},
				subscriptions: formattedSubscriptions,
			},
			message: 'User subscription history retrieved successfully',
		})
	})
)

// Update subscription plan metadata (future feature)
router.put(
	'/subscription-plan',
	superAdmin,
	catchAsyncError(async (req, res, next) => {
		// This endpoint is reserved for future plan editing
		// For now, plans are managed manually in Stripe Dashboard
		return next(
			new ErrorHandler(
				'Plan editing not yet implemented. Plans are managed in Stripe Dashboard.',
				HTTP.NOT_IMPLEMENTED
			)
		)
	})
)

module.exports = router
