const express = require('express')
const router = express.Router()

const routeCommonSubscriptionPlan = require('./route_common_subscription_plan')

router.use('/subscription-plans', routeCommonSubscriptionPlan)

module.exports = router
