const mongoose = require('mongoose')

const featureFlagsSchema = new mongoose.Schema({
	data: {
		type: Object,
		default: { webApp: {}, mobile: {} },
	},
})

const FeatureFlags = mongoose.model('FeatureFlags', featureFlagsSchema)

module.exports = FeatureFlags
