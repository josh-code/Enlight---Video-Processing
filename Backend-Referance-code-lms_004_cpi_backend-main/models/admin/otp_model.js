const mongoose = require('mongoose')

const otpSchema = new mongoose.Schema(
	{
		userId: {
			type: String,
			required: true,
			unique: true,
		},
		otp: {
			type: String,
			required: true,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
		requestHistory: {
			type: [Date],
			default: [],
		},
	},
	{ timestamps: true }
)

const OTP = mongoose.model('OTP', otpSchema)

module.exports = OTP
