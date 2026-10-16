export type Role = 'trainee' | 'admin'
export type Scenario = {
  id: string
  name: string
  type: string
  terrain: string
  time: string
  visibility: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  threatCount: number
  description: string
  image: string
  status: 'Active' | 'Locked' | 'Complete'
}
export type Trainee = {
  id: string
  name: string
  unit: string
  readiness: number
  lastActive: string
  status: string
  role: string
}
export type { LanguageCode } from './language-catalog'
export type NavItem = { label: string; href: string; icon: string }
export type Metric = { label: string; value: string; trend?: string; tone?: 'teal' | 'amber' | 'red' }

export const IMAGE_HERO = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-twSJaalZ28JVkZXFuQRnbNdvWcNWR5.png'
export const IMAGE_TERRAIN = 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-9G1GJwXkBFtPfbCc98WlagmPYiWC5k.png'
export const IMAGE_MAP = 'https://images.unsplash.com/photo-1569336415962-a4bd9f69c07b?auto=format&fit=crop&w=1600&q=85'
export const IMAGE_COAST = 'https://images.unsplash.com/photo-1516690561799-46d8f74f9abf?auto=format&fit=crop&w=900&q=85'
export const IMAGE_URBAN = 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85'
export const IMAGE_NIGHT = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85'
export const IMAGE_DESERT = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=85'
export const IMAGE_MOUNTAIN = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=85'

export { languages } from './language-catalog'

export const copy = {
  en: {
    home: 'Home',
    features: 'Features',
    useCases: 'Use Cases',
    technology: 'Technology',
    about: 'About',
    login: 'Login',
    getStarted: 'Get Started',
    dashboard: 'Dashboard',
    training: 'Training',
    twin: 'Digital Twin',
    aar: 'AAR',
    progress: 'Progress',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
  },
  hi: {
    home: 'होम',
    features: 'विशेषताएँ',
    useCases: 'उपयोग',
    technology: 'तकनीक',
    about: 'परिचय',
    login: 'लॉगिन',
    getStarted: 'शुरू करें',
    dashboard: 'डैशबोर्ड',
    training: 'प्रशिक्षण',
    twin: 'डिजिटल ट्विन',
    aar: 'AAR',
    progress: 'प्रगति',
    profile: 'प्रोफ़ाइल',
    settings: 'सेटिंग्स',
    logout: 'लॉगआउट',
  },
} as const

export const defaultCopy = copy.en

export const scenarios: Scenario[] = [
  { id: 'himalayan-shield', name: 'Himalayan Shield', type: 'Air', terrain: 'High Altitude', time: 'Dawn', visibility: 'Degraded', difficulty: 'Hard', threatCount: 7, description: 'High-altitude drone intrusion across a sensitive mountain corridor.', image: IMAGE_MOUNTAIN, status: 'Active' },
  { id: 'desert-sentinel', name: 'Desert Sentinel', type: 'Land', terrain: 'Desert', time: 'Night', visibility: 'Clear', difficulty: 'Medium', threatCount: 4, description: 'Border surveillance exercise across a remote desert installation.', image: IMAGE_DESERT, status: 'Active' },
  { id: 'coastal-watch', name: 'Coastal Watch', type: 'Coastal', terrain: 'Coastline', time: 'Day', visibility: 'Clear', difficulty: 'Medium', threatCount: 5, description: 'Maritime surveillance around a protected coastal approach.', image: IMAGE_COAST, status: 'Active' },
  { id: 'urban-vigilance', name: 'Urban Vigilance', type: 'Urban', terrain: 'Urban', time: 'Dusk', visibility: 'Reduced', difficulty: 'Hard', threatCount: 7, description: 'Dense city infrastructure and ambiguous civilian air traffic.', image: IMAGE_URBAN, status: 'Active' },
  { id: 'night-watch', name: 'Night Watch', type: 'Night', terrain: 'Rural', time: 'Night', visibility: 'Low Light', difficulty: 'Hard', threatCount: 5, description: 'Track threats through limited visibility and intermittent sensor loss.', image: IMAGE_NIGHT, status: 'Active' },
  { id: 'swarm-intercept', name: 'Swarm Intercept', type: 'Swarm', terrain: 'Open Land', time: 'Day', visibility: 'Clear', difficulty: 'Hard', threatCount: 12, description: 'Coordinate classification across a rapidly splitting swarm.', image: IMAGE_HERO, status: 'Active' },
  { id: 'mountain-edge', name: 'Mountain Edge', type: 'Land', terrain: 'Highlands', time: 'Dawn', visibility: 'Clear', difficulty: 'Medium', threatCount: 3, description: 'Guard a mountain pass against low-signature intrusion.', image: IMAGE_MOUNTAIN, status: 'Active' },
  { id: 'border-horizon', name: 'Border Horizon', type: 'Land', terrain: 'Border', time: 'Day', visibility: 'Haze', difficulty: 'Medium', threatCount: 6, description: 'Maintain a layered response along a wide frontier horizon.', image: IMAGE_DESERT, status: 'Active' },
  { id: 'valley-sentinel', name: 'Valley Sentinel', type: 'Air', terrain: 'Valley', time: 'Dawn', visibility: 'Fog', difficulty: 'Hard', threatCount: 8, description: 'Separate friendly aircraft from threats in a fog-filled valley.', image: IMAGE_MOUNTAIN, status: 'Active' },
  { id: 'desert-storm', name: 'Desert Storm', type: 'Swarm', terrain: 'Desert', time: 'Day', visibility: 'Dust', difficulty: 'Hard', threatCount: 10, description: 'Adapt to dust interference during a coordinated swarm event.', image: IMAGE_DESERT, status: 'Active' },
  { id: 'coastal-guardian', name: 'Coastal Guardian', type: 'Coastal', terrain: 'Coastline', time: 'Dusk', visibility: 'Clear', difficulty: 'Easy', threatCount: 3, description: 'Monitor a coastal installation with a clean sensor picture.', image: IMAGE_COAST, status: 'Complete' },
  { id: 'urban-shield', name: 'Urban Shield', type: 'Urban', terrain: 'Urban', time: 'Day', visibility: 'Haze', difficulty: 'Medium', threatCount: 5, description: 'Protect a critical urban asset while minimizing false positives.', image: IMAGE_URBAN, status: 'Active' },
  { id: 'high-pass', name: 'High Pass', type: 'Air', terrain: 'Highland', time: 'Dawn', visibility: 'Clear', difficulty: 'Hard', threatCount: 4, description: 'Handle a narrow ridgeline breach with uncertain visual confirmation.', image: IMAGE_MOUNTAIN, status: 'Active' },
  { id: 'ridge-keeper', name: 'Ridge Keeper', type: 'Land', terrain: 'High Pass', time: 'Dawn', visibility: 'Fog', difficulty: 'Easy', threatCount: 2, description: 'Secure a narrow mountain pass while the weather shifts.', image: IMAGE_MOUNTAIN, status: 'Locked' },
  { id: 'storm-window', name: 'Storm Window', type: 'Land', terrain: 'Desert', time: 'Night', visibility: 'Dust', difficulty: 'Hard', threatCount: 8, description: 'Keep critical supply routes alive under dust and sensor noise.', image: IMAGE_DESERT, status: 'Locked' },
  { id: 'signal-break', name: 'Signal Break', type: 'Urban', terrain: 'Urban', time: 'Night', visibility: 'Blackout', difficulty: 'Hard', threatCount: 9, description: 'Recover situational awareness after a rapid signal blackout in the city.', image: IMAGE_URBAN, status: 'Locked' },
]

export const trainees: Trainee[] = [
  { id: 'arjun-singh', name: 'Arjun Singh', unit: '1 PARA', readiness: 78, lastActive: '10 Oct 2024', status: 'Training', role: 'Rifleman' },
  { id: 'rahul-verma', name: 'Rahul Verma', unit: '4 RAJ RIF', readiness: 64, lastActive: '10 Oct 2024', status: 'Review', role: 'Operator' },
  { id: 'vikram-patil', name: 'Vikram Patil', unit: 'MARCOS', readiness: 82, lastActive: '10 Oct 2024', status: 'Training', role: 'Team Lead' },
  { id: 'aditya-rao', name: 'Aditya Rao', unit: 'GARUD', readiness: 51, lastActive: '9 Oct 2024', status: 'At Risk', role: 'Operator' },
  { id: 'karan-mehta', name: 'Karan Mehta', unit: '9 PARA', readiness: 71, lastActive: '9 Oct 2024', status: 'Training', role: 'Rifleman' },
  { id: 'sneha-nair', name: 'Sneha Nair', unit: 'IAF', readiness: 88, lastActive: '8 Oct 2024', status: 'Training', role: 'Analyst' },
]

export const adminNav = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'layout-dashboard' },
  { label: 'Trainees', href: '/admin/trainees', icon: 'users' },
  { label: 'Live Training', href: '/admin/live-training', icon: 'crosshair' },
  { label: 'Analytics', href: '/admin/analytics', icon: 'chart-no-axes-combined' },
  { label: 'Scenarios', href: '/admin/scenarios', icon: 'layers-3' },
  { label: 'Reports', href: '/admin/reports', icon: 'file-text' },
  { label: 'Settings', href: '/admin/settings', icon: 'settings' },
  { label: 'Notifications', href: '/admin/notifications', icon: 'bell' },
  { label: 'GARUDA DRISHTI', href: '/admin/drishti', icon: 'bot' },
]

export const soldierNav = [
  { label: 'Dashboard', href: '/soldier/dashboard', icon: 'layout-dashboard' },
  { label: 'Training', href: '/soldier/training', icon: 'target' },
  { label: 'Digital Twin', href: '/soldier/digital-twin', icon: 'brain-circuit' },
  { label: 'AAR', href: '/soldier/aar/session-08-241', icon: 'book-open' },
  { label: 'Progress', href: '/soldier/progress', icon: 'chart-no-axes-combined' },
  { label: 'Profile', href: '/soldier/profile', icon: 'user-round' },
  { label: 'Settings', href: '/soldier/settings', icon: 'settings' },
  { label: 'Notifications', href: '/soldier/notifications', icon: 'bell' },
  { label: 'GARUDA DRISHTI', href: '/soldier/drishti', icon: 'bot' },
]
