const { Schema, model } = require('mongoose')

const ModuleSchema = new Schema({
	name: {
		type: Map,
		of: String,
		required: true,
		validate: {
			validator: function (value) {
				return value && value.size > 0
			},
			message: 'At least one language must be provided for module name',
		},
	},
	description: {
		type: Map,
		of: String,
	},
	course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
	order: { type: Number, required: true },
	sessions: [
		{
			type: Schema.Types.ObjectId,
			ref: 'Session',
		},
	],
})

const Module = model('Module', ModuleSchema)

exports.Module = Module
