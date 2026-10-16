// Bhashini's public model catalogue lists translation broader than ASR/TTS.
// Capability flags describe public model coverage, not this account's access.
const languageEntries = [
  { code: 'en', label: 'English', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'as', label: 'অসমীয়া', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'awa', label: 'अवधी', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'bn', label: 'বাংলা', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'bho', label: 'भोजपुरी', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'bra', label: 'ब्रजभाषा', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'brx', label: 'बड़ो', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'doi', label: 'डोगरी', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'gom', label: 'कोंकणी', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'gon', label: 'गोंडी', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'gu', label: 'ગુજરાતી', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'hoc', label: 'हो', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'hi', label: 'हिन्दी', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'kn', label: 'ಕನ್ನಡ', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'ks', label: 'کٲشُر', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'kha', label: 'Ka Khasi', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'lus', label: 'Mizo', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'mai', label: 'मैथिली', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'mag', label: 'मगही', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'ml', label: 'മലയാളം', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'mr', label: 'मराठी', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'mni', label: 'ꯃꯤꯇꯩꯂꯣꯟ', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'ne', label: 'नेपाली', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'or', label: 'ଓଡ଼ିଆ', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'sa', label: 'संस्कृतम्', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'sat', label: 'ᱥᱟᱱᱛᱟᱲᱤ', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'si', label: 'සිංහල', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'sd', label: 'سنڌي', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'ta', label: 'தமிழ்', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'tcy', label: 'ತುಳು', translation: true, speechRecognition: false, textToSpeech: false },
  { code: 'te', label: 'తెలుగు', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'ur', label: 'اردو', translation: true, speechRecognition: true, textToSpeech: true },
  { code: 'xnr', label: 'कांगड़ी', translation: true, speechRecognition: false, textToSpeech: false },
] as const

// English→target coverage was returned by the configured ULCA translation
// pipeline. ASR and TTS are not part of this app's Bhashini integration.
export const translationLanguageCodes: ReadonlySet<string> = new Set([
  'en', 'as', 'bn', 'brx', 'doi', 'gom', 'gu', 'hi', 'kn', 'ks', 'mai', 'ml',
  'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
])

export const languages = languageEntries.map(({ code, label }) => ({
  code, label, translation: translationLanguageCodes.has(code),
}))

export type LanguageCode = (typeof languageEntries)[number]['code']
export const languageCodes: ReadonlySet<string> = new Set(languages.map((language) => language.code))

