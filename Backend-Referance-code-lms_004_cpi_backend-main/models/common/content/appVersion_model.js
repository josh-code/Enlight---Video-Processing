const mongoose = require('mongoose')

const appVersionSchema = new mongoose.Schema({
	platform: {
		type: String,
		enum: ['ios', 'android'],
		required: true,
	},
	version: {
		type: String,
		required: true,
	},
	releaseDate: {
		type: Date,
		default: Date.now,
	},
	isActive: {
		type: Boolean,
		default: false,
	},
})

const AppVersion = mongoose.model('AppVersion', appVersionSchema)

module.exports = AppVersion
