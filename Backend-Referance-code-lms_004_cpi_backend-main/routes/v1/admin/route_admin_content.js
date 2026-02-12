const express = require('express')
const router = express.Router()

const course = require('./content/route_admin_course')
const session = require('./content/route_admin_session')
const statics = require('./content/route_admin_statics')
const modules = require('./content/route_admin_module')
const aws = require('./content/route_admin_aws')
const appVersion = require('./content/route_admin_app-version')
const feature = require('./content/route_admin_feature-flag')
const aiGeneration = require('./content/route_admin_ai-generation')
const importSampleData = require('./content/route_admin_import_sample_data')

router.use('/course', course)
router.use('/session', session)
router.use('/statics', statics)
router.use('/modules', modules)
router.use('/aws', aws)
router.use('/app-version', appVersion)
router.use('/feature', feature)
router.use('/ai', aiGeneration)
router.use('/import', importSampleData)

module.exports = router
