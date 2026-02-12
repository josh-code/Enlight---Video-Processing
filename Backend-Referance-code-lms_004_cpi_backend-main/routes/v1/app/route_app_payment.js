const { Router } = require('express')
const sendResponse = require('../../../utils/sendResponse')
const catchAsyncError = require('../../../middleware/catchAsyncError')
const router = Router()

router.post(
	'/',
	catchAsyncError(async (req, res) => {
		sendResponse({
			res,
			status: true,
			code: HTTP.OK,
			data: { message: 'Payment successful' },
			message: 'Payment successful',
		})
	})
)

module.exports = router
