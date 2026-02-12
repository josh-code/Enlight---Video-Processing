const mongoose = require('mongoose')
const { generateObjectUrl } = require('../../../services/aws/utils')

const badgeSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
		},
		description: {
			type: String,
			required: true,
		},
		iconPath: {
			type: String,
			required: true,
		},
		isRepeatable: {
			type: Boolean,
			required: true,
		},
	},
	{
		timestamps: true,
	}
)

// Middleware to generate URLs for files
badgeSchema.post(['find', 'findOne', 'findById'], async function (docs) {
	if (Array.isArray(docs)) {
		await Promise.all(
			docs.map(async (doc) => {
				if (doc.iconPath) {
					doc.iconPath = await generateObjectUrl(doc.iconPath)
				}
			})
		)
	} else if (docs) {
		if (docs.iconPath) {
			docs.iconPath = await generateObjectUrl(docs.iconPath)
		}
	}
})

const Badge = mongoose.model('Badge', badgeSchema)

module.exports = Badge
