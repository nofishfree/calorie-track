import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleBackButton, useUIStore } from './uiStore'
import { initTheme, useThemeStore } from './themeStore'

beforeEach(() => {
  localStorage.clear()
  useUIStore.setState({ showProfileDrawer: false, lastBackPressedAt: 0, statusBarHeight: 0, routeStack: [] })
  useThemeStore.setState({ mode: 'light' })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    }),
  })
})

describe('UI route state', () => {
  it('tracks route entries and handles drawer, history, and exit actions', () => {
    useUIStore.getState().pushRouteEntry('/foods', '/')
    expect(useUIStore.getState().getEntryForRoute('/foods')).toBe('/')
    const navigate = vi.fn()
    expect(handleBackButton('/foods', false, vi.fn(), navigate)).toBe('navigate-entry')
    expect(navigate).toHaveBeenCalledWith('/', { replace: false })

    useUIStore.getState().setShowProfileDrawer(true)
    expect(handleBackButton('/foods', false, vi.fn(), navigate)).toBe('close-drawer')
    expect(useUIStore.getState().showProfileDrawer).toBe(false)

    vi.setSystemTime(new Date('2025-03-15T12:00:00.000Z'))
    expect(handleBackButton('/', false, vi.fn(), navigate)).toBe('toast-exit')
    expect(handleBackButton('/', false, vi.fn(), navigate)).toBe('exit-app')
  })
})

describe('theme state', () => {
  it('sets effective theme and initializes from persisted storage', () => {
    useThemeStore.getState().setMode('dark')
    expect(useThemeStore.getState().getEffectiveTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    localStorage.setItem('theme-storage', JSON.stringify({ state: { mode: 'light' } }))
    initTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
