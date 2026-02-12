const mongoose = require('mongoose')
const config = require('config')

const db = config.get('db')
module.exports = function () {
	//-----------------------connecting mongo db---------------------------
	// mongoose.set("useCreateIndex", true);
	// mongoose.set("useNewUrlParser", true);

	mongoose
		.connect(db)
		.then(() => console.log(`connected to ${db}`))
		.catch((err) => console.error(`could not connect to MongoDB...`, err))
}
