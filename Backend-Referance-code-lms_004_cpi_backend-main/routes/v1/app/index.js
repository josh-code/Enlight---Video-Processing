const express = require('express')
const router = express.Router()

const auth = require('./route_app_auth')
const content = require('./route_app_content')
const communication = require('./route_app_communication')
const languageGroup = require('./route_app_languageGroup')
const user = require('./route_app_user')
const payments = require('./route_app_payment')
const subscription = require('./route_app_subscription')
const paymentMethods = require('./route_app_payment_methods')

router.use('/auth', auth)
router.use('/content', content)
router.use('/communication', communication)
router.use('/languageGroup', languageGroup)
router.use('/user', user)
router.use('/payments', payments)
router.use('/subscription', subscription)
router.use('/payment-methods', paymentMethods)

module.exports = router
