import { adminNav, soldierNav } from './types'
export { adminNav, soldierNav }
export const routeForScenario = (id: string, view: 'briefing'|'simulation' = 'briefing') => `/soldier/training/${id}/${view}`
export const iconMap = { 'layout-dashboard':'LayoutDashboard', users:'Users', crosshair:'Crosshair', 'chart-no-axes-combined':'ChartNoAxesCombined', 'layers-3':'Layers3', 'file-text':'FileText', settings:'Settings', target:'Target', 'brain-circuit':'BrainCircuit', 'book-open':'BookOpen', 'user-round':'UserRound',bell:'Bell',bot:'Bot' } as const
