/**
 * Content Services Index
 * Centralized exports for all content-related services
 */

const courseService = require('./courseService')
const sessionService = require('./sessionService')

module.exports = {
	courseService,
	sessionService,
}
