import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeMode } from '../types'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  getEffectiveTheme: () => 'light' | 'dark'
}

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return 'light'
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      
      setMode: (mode) => {
        set({ mode })
        const effectiveTheme = mode === 'system' ? getSystemTheme() : mode
        document.documentElement.setAttribute('data-theme', effectiveTheme)
      },
      
      getEffectiveTheme: () => {
        const { mode } = get()
        return mode === 'system' ? getSystemTheme() : mode
      },
    }),
    {
      name: 'theme-storage',
    }
  )
)

export const initTheme = () => {
  const stored = localStorage.getItem('theme-storage')
  let mode: ThemeMode = 'light'
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      mode = parsed.state?.mode || 'light'
    } catch {
      mode = 'light'
    }
  }
  const effectiveTheme = mode === 'system' ? getSystemTheme() : mode
  document.documentElement.setAttribute('data-theme', effectiveTheme)
  
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      const currentMode = useThemeStore.getState().mode
      if (currentMode === 'system') {
        const newTheme = getSystemTheme()
        document.documentElement.setAttribute('data-theme', newTheme)
      }
    })
  }
}

