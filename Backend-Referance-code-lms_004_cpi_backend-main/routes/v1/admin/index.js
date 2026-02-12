const { Router } = require('express')
const router = Router()

const member = require('./route_admin_members/route_admin_members')
const superAdmin = require('./route_admin_members/route_admin_superadmin')
const content = require('./route_admin_content')
const reports = require('./route_admin_reports')
const subscription = require('./route_admin_subscription')

router.use('/member', member)
router.use('/auth', superAdmin)
router.use('/content', content)
router.use('/reports', reports)
router.use('/subscription', subscription)

module.exports = router
