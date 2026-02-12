const clientTypeMiddleware = (req, res, next) => {
	const clientType =
		req.headers['x-client-type']?.toLowerCase() ||
		(req.useragent?.isMobile ? 'mobile' : 'web')

	if (!['web', 'mobile'].includes(clientType)) {
		return res.status(400).json({
			error: "Invalid client type. Use 'web' or 'mobile'",
		})
	}

	req.clientType = clientType
	next()
}

module.exports = clientTypeMiddleware
