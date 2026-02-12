const express = require('express')
const bcrypt = require('bcrypt')
const config = require('config')
const Joi = require('joi')
const _ = require('lodash')

const router = express.Router()
const {
	User,
	validateUser: validate,
} = require('../../../../models/app/user_model')
const superAdmin = require('../../../../middleware/superAdmin')
const {
	generateResetToken,
	createAndSendOTP,
	verifyOTP,
} = require('../../../../services/otp')
const catchAsyncError = require('../../../../middleware/catchAsyncError')
const sendResponse = require('../../../../utils/sendResponse')
const ErrorHandler = require('../../../../utils/errorHandler')
const HTTP = require('../../../../constants/httpStatus')

const expirationTimeMinutes =
	parseInt(config.get('EXPIRATION_TIME_MINUTES'), 10) || 10

router.post(
	'/signup',
	catchAsyncError(async (req, res, next) => {
		if (
			!req.body.signupAuthorizationAllowance ||
			req.body.signupAuthorizationAllowance === false
		) {
			return next(new ErrorHandler('Access Denied', HTTP.UNAUTHORIZED))
		}

		const data = _.pick(req.body, [
			'firstName',
			'lastName',
			'email',
			'phone',
			'phonePin',
			'country',
			'church',
			'state',
		])
		const { error } = validate(data)
		if (error) {
			return next(new ErrorHandler(error.message, HTTP.BAD_REQUEST))
		}

		const salt = await bcrypt.genSalt(10)
		const password = await bcrypt.hash(req.body.password, salt)

		let user = new User(data)
		user.password = password
		user.isEnabled = true
		user.isSuperAdmin = true
		user.isAdmin = false
		user.isUser = false
		user.isSubAdmin = false

		user = await user.save()
		let token = await user.generateAuthToken(null, 'Web')

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: token,
			message: 'Signup successful',
		})
	})
)

router.post(
	'/login',
	catchAsyncError(async (req, res, next) => {
		const schema = Joi.object({
			email: Joi.string().email().required(),
			password: Joi.string().min(6).required(),
		})
		const { error } = schema.validate(req.body)
		if (error) {
			return next(new ErrorHandler('Invalid input', HTTP.BAD_REQUEST))
		}

		const user = await User.findOne({
			email: { $regex: new RegExp(`^${req.body.email}$`, 'i') },
			isSuperAdmin: true,
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		if (!user.password) {
			return next(
				new ErrorHandler(
					"Password not created. Please use 'Forgot Password' to set your password.",
					HTTP.BAD_REQUEST
				)
			)
		}

		// Validate password
		const isPasswordValid = await bcrypt.compare(
			req.body.password,
			user.password
		)
		if (!isPasswordValid) {
			return next(
				new ErrorHandler('Invalid email or password', HTTP.BAD_REQUEST)
			)
		}

		// Generate and return token
		const token = await user.generateAuthToken(null, 'Web')

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: token,
			message: 'Login successful',
		})
	})
)

router.post(
	'/forgotPassword',
	catchAsyncError(async (req, res, next) => {
		let { email } = req.body

		if (!email) {
			return next(new ErrorHandler('Invalid Data', HTTP.BAD_REQUEST))
		}

		email = email.toString().trim()

		const user = await User.findOne({
			email: { $regex: new RegExp(`^${email}$`, 'i') },
			isSuperAdmin: true,
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})
		if (!user) {
			return next(new ErrorHandler('Invalid Data', HTTP.BAD_REQUEST))
		}

		const otpResponse = await createAndSendOTP(user, 'email', {
			subject: 'Your OTP for Password Reset',
			template: 'otp-email',
		})
		if (!otpResponse.success) {
			return next(new ErrorHandler(otpResponse.message, HTTP.BAD_REQUEST))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { otpSent: true },
			message: 'OTP sent successfully',
		})
	})
)

router.post(
	'/verifyOtp',
	catchAsyncError(async (req, res, next) => {
		let { otp, email } = req.body

		if (!otp || !email) {
			return next(new ErrorHandler('Invalid Data', HTTP.BAD_REQUEST))
		}

		email = email.toString().trim()

		const user = await User.findOne({
			email: { $regex: new RegExp(`^${email}$`, 'i') },
			isSuperAdmin: true,
			$or: [{ isDeleted: false }, { isDeleted: { $exists: false } }],
		})

		if (!user) {
			return next(new ErrorHandler('Invalid Data', HTTP.BAD_REQUEST))
		}

		const otpResponse = await verifyOTP(user, otp)
		if (!otpResponse.success) {
			return next(new ErrorHandler(otpResponse.message, HTTP.BAD_REQUEST))
		}

		// Generate reset token
		const resetToken = generateResetToken()
		const resetTokenExpiresAt = new Date(
			Date.now() + expirationTimeMinutes * 60 * 1000
		)

		await User.findByIdAndUpdate(user._id, {
			resetToken: {
				token: resetToken,
				expiresAt: resetTokenExpiresAt,
			},
		})

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { otpVerified: true, resetToken },
			message: 'OTP verified successfully',
		})
	})
)

router.post(
	'/resetPassword',
	catchAsyncError(async (req, res, next) => {
		let { resetToken, password, confirmPassword } = req.body

		if (!resetToken || !password || !confirmPassword) {
			return next(new ErrorHandler('Invalid Data', HTTP.BAD_REQUEST))
		}

		resetToken = resetToken.toString().trim()
		password = password.toString().trim()
		confirmPassword = confirmPassword.toString().trim()

		if (password !== confirmPassword) {
			return next(new ErrorHandler('Passwords do not match', HTTP.BAD_REQUEST))
		}

		const user = await User.findOne({
			'resetToken.token': resetToken,
			'resetToken.expiresAt': { $gt: new Date() },
		})

		if (!user) {
			return next(
				new ErrorHandler('Invalid or expired reset token', HTTP.BAD_REQUEST)
			)
		}

		const salt = await bcrypt.genSalt(10)
		const newPassword = await bcrypt.hash(password, salt)

		// Update the user's password
		await User.findByIdAndUpdate(user._id, {
			password: newPassword,
			resetToken: null,
		})

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: null,
			message: 'Password reset successful',
		})
	})
)

router.put(
	'/updateSA',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		let obj = _.pick(req.body, [
			'_id',
			'firstName',
			'lastName',
			'email',
			'phone',
		])

		if (!(obj.firstName && obj.lastName && obj.email && obj.phone)) {
			return next(new ErrorHandler('Invalid Data', HTTP.BAD_REQUEST))
		}

		await User.findByIdAndUpdate(obj._id, obj)
		const updatedUser = await User.findById(obj._id)
		const token = await updatedUser.generateAuthToken(null, 'Web')

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: token,
			message: 'Super admin updated successfully',
		})
	})
)

router.get(
	'/verify-admin',
	[superAdmin],
	catchAsyncError(async (req, res, next) => {
		const user = await User.findById(req.user._id).select('-password')
		if (!user) {
			return next(new ErrorHandler('User not found', HTTP.NOT_FOUND))
		}

		return sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: user,
			message: 'Admin verified successfully',
		})
	})
)

module.exports = router
