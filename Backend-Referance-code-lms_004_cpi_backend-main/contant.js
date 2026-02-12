module.exports = {
	TRANSCRIBE_JOB_PREFIX: {
		SESSION: 'Transcription_session_',
		COURSE: 'Transcription_course_',
	},
	TRANSCRIBE_STATUS: {
		COMPLETED: 'COMPLETED',
		IN_PROGRESS: 'IN_PROGRESS',
		FAILED: 'FAILED',
	},
	LANGUAGE_CODE: {
		EN_US: 'en-US',
		ES_US: 'es-US',
	},
	VIDEO_JOB_PREFIX: {
		SESSION: 'Video_session_',
		COURSE: 'Video_course_',
	},
	BADGES: {
		Mustard_Seed_Starter: '6710d34b150fc1ddc097f34e',
		Faithful_Listener: '6710d34b150fc1ddc097f34f',
		Quiz_Whiz: '6710d34b150fc1ddc097f350',
		Wisdom_Seeker: '6710d34b150fc1ddc097f351',
		Daily_Bread: '6710d34b150fc1ddc097f352',
		Steadfast_Servant: '6710d34b150fc1ddc097f353',
		Good_Steward: '6710d34b150fc1ddc097f354',
		Resilient_Returner: '6710d34b150fc1ddc097f356',
		Angels_Advocate: '6710d34b150fc1ddc097f357',
		Beacon_of_Light: '6710d34b150fc1ddc097f358',
		Harvest_Gatherer: '6710d34b150fc1ddc097f359',
		Mountaintop_Milestone: '6710d34b150fc1ddc097f35a',
		Heart_of_Gold: '6710d34b150fc1ddc097f35b',
	},
	Mountaintop_Milestone_TIME_LIMIT_IN_DAYS: 2,
	STREAK_THRESHOLDS: {
		DAILY_BREAD: 7,
		STEADFAST_SERVANT: 10,
		BEACON_OF_LIGHT: 20,
		HEART_OF_GOLD: 30,
	},
	HIATUS_THRESHOLD_DAYS: 30,
	POINT_THRESHOLDS: {
		GOOD_STEWARD: 500,
		HARVEST_GATHERER: 1000,
	},
	MAX_SESSION_LIMIT: 2,
	CPI_COURSE_ID: '6900748dbb6d83cbbf327d60',
	PAYMENT_TOKEN_EXPIRATION_TIME_HOURS: 3 * 24,
	AI_GENERATION: {
		MAX_TITLE_LENGTH: 75,
		MIN_DESCRIPTION_LENGTH: 200,
		TARGET_DESCRIPTION_LENGTH: {
			MIN: 300,
			MAX: 400,
		},
		MAX_OUTPUT_TOKENS: 800,
		PROMPT_TOKENS: 200,
		MAX_TRANSCRIPTION_CHARS: 12000, // ≈3000 tokens
		OPENAI_CONTEXT_LIMIT: 4096,
	},
	RESTRICTED_PLATFORM: 'ios',
	OTP_LIMIT: {
		MAX_REQUESTS: 3,
		TIME_WINDOW_MINUTES: 30, // Rolling 30-minute window
	},
}
