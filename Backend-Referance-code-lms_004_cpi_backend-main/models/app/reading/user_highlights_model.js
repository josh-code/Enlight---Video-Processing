const { Schema, model } = require('mongoose')

const userHighlightSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		book: {
			type: String,
			required: true,
			index: true,
		},
		chapter: {
			type: Number,
			required: true,
			index: true,
		},
		bibleVersion: {
			type: String,
			required: true,
			index: true,
		},
		verses: [
			{
				verseNumber: {
					type: Number,
					required: true,
				},
				text: {
					type: String,
					required: true,
				},
			},
		],
		color: {
			type: String,
			required: true,
			enum: ['yellow', 'green', 'blue', 'pink', 'orange'],
		},
		note: {
			type: String,
			maxlength: 1000,
		},
		tags: [
			{
				type: String,
				maxlength: 50,
			},
		],
		isPublic: {
			type: Boolean,
			default: false,
		},
		createdAt: {
			type: Date,
			default: Date.now,
		},
		updatedAt: {
			type: Date,
			default: Date.now,
		},
	},
	{
		timestamps: true,
	}
)

// Compound indexes for efficient querying
userHighlightSchema.index({ userId: 1, book: 1, chapter: 1, bibleVersion: 1 })
userHighlightSchema.index({ userId: 1, bibleVersion: 1, createdAt: -1 })
userHighlightSchema.index({
	book: 1,
	chapter: 1,
	bibleVersion: 1,
	'verses.verseNumber': 1,
})

// Virtual for formatted reference
userHighlightSchema.virtual('reference').get(function () {
	const verseNumbers = this.verses
		.map((v) => v.verseNumber)
		.sort((a, b) => a - b)
	const startVerse = verseNumbers[0]
	const endVerse = verseNumbers[verseNumbers.length - 1]
	const verseRange =
		startVerse === endVerse ? startVerse : `${startVerse}-${endVerse}`
	return `${this.book} ${this.chapter}:${verseRange}`
})

// Ensure virtual fields are serialized
userHighlightSchema.set('toJSON', { virtuals: true })

module.exports = model('UserHighlight', userHighlightSchema)
