const FeatureFlags = require('../../models/common/content/features_model')

async function loadFeatureFlags() {
	let featureFlags = await FeatureFlags.findOne({})
	if (!featureFlags) {
		// If no document exists, create a new one with default data.
		const defaultData = {
			webApp: {
				enabled: true,
				abTesting: false,
				description: 'This is description of web app',
				keyName: 'Web App',
			},
			mobile: {
				enabled: true,
				abTesting: false,
				description: 'This is short description of mobile feature',
				keyName: 'Mobile',
			},
		}
		featureFlags = await FeatureFlags.create({ data: defaultData })
	}
	return featureFlags.data
}

async function saveFeatureFlags(newData) {
	let featureFlags = await FeatureFlags.findOne({})
	if (!featureFlags) {
		featureFlags = await FeatureFlags.create({ data: newData })
	} else {
		featureFlags.data = newData
		await featureFlags.save()
	}
}

module.exports = {
	loadFeatureFlags,
	saveFeatureFlags,
}
