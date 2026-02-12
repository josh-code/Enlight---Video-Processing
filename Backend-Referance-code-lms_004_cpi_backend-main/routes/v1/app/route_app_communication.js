const express = require('express')
const router = express.Router()

const notification = require('./communication/route_app_notification')

router.use('/notification', notification)

module.exports = router
