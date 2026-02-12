const nodemailer = require('nodemailer')
const hbs = require('nodemailer-express-handlebars')
const path = require('path')
const config = require('config')

const SMTP_HOST = config.get('SMTP_HOST')
const SMTP_PORT = config.get('SMTP_PORT')
const SMTP_USER = config.get('SMTP_USER')
const SMTP_PASSWORD = config.get('SMTP_PASS')
const SMTP_FROM = config.get('SMTP_FROM_EMAIL')

const sendMail = async ({ subject, send_to, reply_to, template, context }) => {
	const transporter = nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT,
		// secure: true,
		auth: {
			user: SMTP_USER,
			pass: SMTP_PASSWORD,
		},
	})

	const handlebarOptions = {
		viewEngine: {
			extName: '.handlebars',
			partialsDir: path.resolve('./views'),
			defaultLayout: false,
		},
		viewPath: path.resolve('./views'),
		extName: '.handlebars',
	}

	transporter.use('compile', hbs(handlebarOptions))

	const mailOptions = {
		from: SMTP_FROM,
		to: send_to,
		replyTo: reply_to,
		subject,
		template,
		context,
	}

	try {
		const info = await transporter.sendMail(mailOptions)
		return {
			success: true,
			message: 'Email sent successfully',
			info,
		}
	} catch (err) {
		console.log({ err })
		return {
			success: false,
			message: 'Failed to send email',
			error: err,
		}
	}
}

module.exports = sendMail
