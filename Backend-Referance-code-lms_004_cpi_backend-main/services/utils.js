exports.extractS3Key = (url) => {
	try {
		const match = url.match(/amazonaws\.com\/(.+)/)
		return match ? match[1] : url // Extract everything after 'amazonaws.com/'
	} catch (error) {
		console.error('Error extracting S3 key:', error)
		return url
	}
}

exports.calculateExpiration = (hours, userTimeZone) => {
	const expirationDate = new Date(Date.now() + hours * 60 * 60 * 1000)

	// If userTimeZone is provided and not UTC, try to use that timezone
	// If no timezone, invalid timezone, or UTC, use UTC formatting
	let timeZone = 'UTC'

	if (userTimeZone && userTimeZone !== 'UTC') {
		try {
			// Test if the timezone is valid by trying to format a date with it
			new Date().toLocaleString('en-US', { timeZone: userTimeZone })
			timeZone = userTimeZone
		} catch (error) {
			// If timezone is invalid, fall back to UTC
			console.warn(`Invalid timezone "${userTimeZone}", falling back to UTC`)
			timeZone = 'UTC'
		}
	}

	return {
		expirationDate: expirationDate.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: timeZone,
		}),
		expirationTime: expirationDate.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
			timeZone: timeZone,
		}),
		isUTC: timeZone === 'UTC',
		timeZone: timeZone,
	}
}

exports.calculateDateInUserTimeZone = ({
	date,
	userTimeZone,
	includeTime = true,
}) => {
	const expirationDate = new Date(date)

	return includeTime
		? expirationDate.toLocaleString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric',
				second: 'numeric',
				timeZone: userTimeZone,
				hour12: true,
			})
		: expirationDate.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				timeZone: userTimeZone,
			})
}
