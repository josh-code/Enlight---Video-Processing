const express = require('express')
const router = express.Router()

const appRoutes = require('./app')
const adminRoutes = require('./admin')
const commonRoutes = require('./common')

router.use('/app', appRoutes)
router.use('/admin', adminRoutes)
router.use('/common', commonRoutes)

module.exports = router
