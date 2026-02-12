const geoip = require('geoip-lite')

function geoipMiddleware(req, res, next) {
	const xForwardedFor = req.headers['x-forwarded-for']
	const clientIp = xForwardedFor
		? xForwardedFor.split(',')[0].trim()
		: req.connection.remoteAddress

	// Get user geo
	const geo = geoip.lookup(clientIp)

	if (geo) {
		req.geoip = {
			country: geo.country,
			region: geo.region,
			city: geo.city,
			ll: geo.ll,
		}
	} else {
		req.geoip = null
	}

	next()
}

module.exports = geoipMiddleware
