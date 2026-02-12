const i18next = require('i18next')
const Backend = require('i18next-fs-backend')
const path = require('path')
const {
	DEFAULT_LANGUAGE,
	SUPPORTED_LANGUAGES,
} = require('../../constants/supportedLanguage')

const i18nextPromise = i18next.use(Backend).init({
	preload: SUPPORTED_LANGUAGES,
	lng: DEFAULT_LANGUAGE,
	fallbackLng: DEFAULT_LANGUAGE,
	backend: {
		loadPath: path.join(__dirname, '../../locales/{{lng}}/{{ns}}.json'),
	},
	ns: ['translation', 'content'],
	defaultNS: 'translation',
	interpolation: {
		escapeValue: false,
	},
	detection: {
		order: ['querystring', 'cookie', 'header'],
		lookupQuerystring: 'lang',
		lookupCookie: 'i18next',
		lookupHeader: 'accept-language',
	},
})

module.exports = { i18next, i18nextPromise }
