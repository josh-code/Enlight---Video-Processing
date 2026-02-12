const {
	Tracking_UserActions,
} = require('../models/app/tracking/tracking_UserActions_model')
const { User } = require('../models/app/user_model')

async function trackUserSession(userId) {
	try {
		const userSession = new Tracking_UserActions({
			action: 'session',
			date: new Date(),
			userId,
		})
		await userSession.save()
		return true
	} catch (error) {
		return false
	}
}

async function getUserStreaksDates(userId) {
	try {
		const results = await Tracking_UserActions.aggregate([
			{
				$match: { userId },
			},
			{
				$group: {
					_id: {
						year: { $year: '$date' },
						month: { $month: '$date' },
						day: { $dayOfMonth: '$date' },
					},
					doc: { $first: '$$ROOT' },
				},
			},
			{
				$replaceRoot: { newRoot: '$doc' },
			},
		])

		return results
	} catch (err) {
		console.error(err)

		return []
	}
}

// Without time zone calculation
// async function getUserStreakDays(userId) {
//     try {
//         // console.log("userid", userId);
//         const sessionObjects = await Tracking_UserActions.find({ userId });

//         // console.log("sees", sessionObjects);
//         if (!sessionObjects || sessionObjects.length === 0) {
//             return 1;
//         }

//         sessionObjects.sort((a, b) => new Date(b.date) - new Date(a.date));

//         let streak = 0;
//         let currentDate = new Date();
//         currentDate.setHours(0, 0, 0, 0);
//         let lastSessionDate = new Date();

//         for (let i = 0; i < sessionObjects.length; i++) {
//             const sessionDate = new Date(sessionObjects[i].date);
//             sessionDate.setHours(0, 0, 0, 0);

//             if (sessionDate.getTime() === lastSessionDate.getTime()) {
//                 continue; // Skip multiple sessions on the same day
//             }

//             if (streak === 0 && sessionDate.getTime() === currentDate.getTime()) {
//                 streak = 1; // Start streak from today
//             } else if (streak > 0 && sessionDate.getTime() === currentDate.getTime() - streak * 24 * 60 * 60 * 1000) {
//                 streak++; // Increment streak if consecutive
//             } else {
//                 break; // Streak broken
//             }
//             lastSessionDate = sessionDate;
//         }

//         return streak ? streak : 1;
//     } catch (error) {
//         console.log(error);
//         return 0;
//     }

// }

// Time zone based streaks
// async function getUserStreakDays(userId) {
//     try {
//         // console.log("userid", userId);

//         const user = await User.findById(userId);
//         const userTimeZone = user.timeZone;

//         console.log({ userTimeZone })

//         if (!userTimeZone) {
//             return 0;
//         }

//         const sessionObjects = await Tracking_UserActions.find({ userId });

//         if (!sessionObjects || sessionObjects.length === 0) {
//             return 1;
//         }

//         sessionObjects.sort((a, b) => new Date(b.date) - new Date(a.date));

//         let streak = 0;

//         // Get the current date in the user's local time zone and set time to midnight
//         let currentDate = new Date();
//         let localizedDate = new Date(currentDate.toLocaleString("en-US", { timeZone: userTimeZone }));
//         localizedDate.setHours(0, 0, 0, 0);

//         // Variable to track the last session date
//         let lastSessionDate = null;

//         for (let i = 0; i < sessionObjects.length; i++) {
//             const sessionDate = new Date(sessionObjects[i].date);
//             const localSessionDate = new Date(
//                 sessionDate.toLocaleString("en-US", { timeZone: userTimeZone })
//             );
//             localSessionDate.setHours(0, 0, 0, 0); // Set session date to local midnight

//             // Skip multiple sessions on the same day (based on the local date)
//             if (
//                 lastSessionDate &&
//                 localSessionDate.getTime() === lastSessionDate.getTime()
//             ) {
//                 continue;
//             }

//             // If it's the first session and on the same day as the current date, start the streak
//             if (
//                 streak === 0 &&
//                 localSessionDate.getTime() === localizedDate.getTime()
//             ) {
//                 streak = 1; // Start the streak from today
//             }
//             // Increment streak if the session is on the previous consecutive day
//             else if (
//                 streak > 0 &&
//                 localSessionDate.getTime() ===
//                 localizedDate.getTime() - streak * 24 * 60 * 60 * 1000
//             ) {
//                 streak++; // Continue the streak
//             }
//             // Streak is broken if not consecutive
//             else {
//                 break;
//             }

//             lastSessionDate = localSessionDate;
//         }

//         return streak ? streak : 1;
//     } catch (error) {
//         console.log(error);
//         return 0;
//     }

// }

async function getUserStreakDays(userId) {
	try {
		// Fetch the user to check if they have a time zone set
		const user = await User.findById(userId)
		if (!user || !user.timeZone || user.isDeleted) {
			return 0
		}

		const userTimeZone = user.timeZone

		// Fetch user actions (sessions)
		const sessionObjects = await Tracking_UserActions.find({ userId })

		// If there are no sessions, the streak is 1 (as it's considered their first session)
		if (!sessionObjects || sessionObjects.length === 0) {
			return 1
		}

		// Sort session objects by date (newest to oldest)
		sessionObjects.sort((a, b) => new Date(b.date) - new Date(a.date))

		let streak = 0
		let currentDate = new Date()

		if (userTimeZone) {
			// Convert current date to the user's local time zone and set time to midnight
			let localizedDate = new Date(
				currentDate.toLocaleString('en-US', { timeZone: userTimeZone })
			)
			localizedDate.setHours(0, 0, 0, 0)

			let lastSessionDate = null

			for (let i = 0; i < sessionObjects.length; i++) {
				const sessionDate = new Date(sessionObjects[i].date)
				const localSessionDate = new Date(
					sessionDate.toLocaleString('en-US', { timeZone: userTimeZone })
				)
				localSessionDate.setHours(0, 0, 0, 0) // Set session date to local midnight

				// Skip multiple sessions on the same day (based on the local date)
				if (
					lastSessionDate &&
					localSessionDate.getTime() === lastSessionDate.getTime()
				) {
					continue
				}

				// If it's the first session and on the same day as the current date, start the streak
				if (
					streak === 0 &&
					localSessionDate.getTime() === localizedDate.getTime()
				) {
					streak = 1 // Start the streak from today
				}
				// Increment streak if the session is on the previous consecutive day
				else if (
					streak > 0 &&
					localSessionDate.getTime() ===
						localizedDate.getTime() - streak * 24 * 60 * 60 * 1000
				) {
					streak++ // Continue the streak
				}
				// Streak is broken if not consecutive
				else {
					break
				}

				lastSessionDate = localSessionDate
			}
		} else {
			// Default streak calculation (no time zone provided)
			console.log('no time zone')
			currentDate.setHours(0, 0, 0, 0)
			let lastSessionDate = new Date()

			for (let i = 0; i < sessionObjects.length; i++) {
				const sessionDate = new Date(sessionObjects[i].date)
				sessionDate.setHours(0, 0, 0, 0) // Set to midnight

				// Skip multiple sessions on the same day
				if (sessionDate.getTime() === lastSessionDate.getTime()) {
					continue
				}

				// If it's the first session and on the same day as the current date, start the streak
				if (streak === 0 && sessionDate.getTime() === currentDate.getTime()) {
					streak = 1 // Start streak from today
				}
				// Increment streak if the session is on the previous consecutive day
				else if (
					streak > 0 &&
					sessionDate.getTime() ===
						currentDate.getTime() - streak * 24 * 60 * 60 * 1000
				) {
					streak++ // Continue streak
				}
				// Streak is broken if not consecutive
				else {
					break
				}

				lastSessionDate = sessionDate
			}
		}

		return streak ? streak : 1
	} catch (error) {
		console.log(error)
		return 0
	}
}

module.exports = {
	trackUserSession,
	getUserStreakDays,
	getUserStreaksDates,
}
