import type { LanguageCode } from './language-catalog'

// Small reviewed fallbacks for primary navigation and common actions. Other
// interface text is translated in batches through the server-side Bhashini API.
export const staticUiTranslations: Partial<Record<LanguageCode, Record<string, string>>> = {
  hi: {
    Home: 'होम', Features: 'विशेषताएँ', 'Use Cases': 'उपयोग', Technology: 'तकनीक', About: 'परिचय',
    Login: 'लॉगिन', 'Secure Login': 'सुरक्षित लॉगिन', 'Get Started': 'शुरू करें', Dashboard: 'डैशबोर्ड',
    Training: 'प्रशिक्षण', 'Digital Twin': 'डिजिटल ट्विन', Progress: 'प्रगति', Profile: 'प्रोफ़ाइल',
    Settings: 'सेटिंग्स', Logout: 'लॉगआउट', Trainees: 'प्रशिक्षु', Analytics: 'विश्लेषिकी',
    Reports: 'रिपोर्ट', Scenarios: 'परिदृश्य', Notifications: 'सूचनाएँ', 'Mark all read': 'सभी को पढ़ा हुआ चिह्नित करें',
    'Welcome back': 'वापसी पर स्वागत है', 'Create your account': 'अपना खाता बनाएँ',
    'Create Account': 'खाता बनाएँ', Password: 'पासवर्ड', 'Full Name': 'पूरा नाम',
    'Soldier / Trainee': 'सैनिक / प्रशिक्षु', Administrator: 'प्रशासक', 'Ready when you are': 'जब आप तैयार हों',
    'AAR': 'कार्रवाई के बाद की समीक्षा', 'After Action Review': 'कार्रवाई के बाद की समीक्षा',
  },
}

