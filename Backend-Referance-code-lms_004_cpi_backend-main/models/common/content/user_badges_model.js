const mongoose = require('mongoose')

const userBadges = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		badge: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Badge',
			required: true,
		},
		earnedAt: {
			type: Date,
			default: Date.now,
		},
		timesEarned: {
			type: Number,
			default: 1,
		},
		lastEarned: {
			type: Date,
			default: Date.now,
		},
		seen: { type: Boolean, default: false },
	},
	{ timestamps: true }
)

const UserBadges = mongoose.model('UserBadges', userBadges)

module.exports = UserBadges
