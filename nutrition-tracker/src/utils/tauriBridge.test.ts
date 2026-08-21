import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../stores'
import {
  detectStatusBarHeight,
  isTauriEnvironment,
  listenBackButton,
  listenStatusBarUpdates,
  requestAppExit,
} from './tauriBridge'

describe('tauriBridge environment and fallback behavior', () => {
  beforeEach(() => {
    delete (window as Window & { __TAURI__?: unknown; __STATUS_BAR_HEIGHT__?: unknown }).__TAURI__
    delete (window as Window & { __TAURI__?: unknown; __STATUS_BAR_HEIGHT__?: unknown }).__STATUS_BAR_HEIGHT__
    useUIStore.setState({ statusBarHeight: 0 })
    document.documentElement.style.cssText = ''
    vi.useFakeTimers()
  })

  it('detects Tauri markers and falls back to the browser environment', () => {
    expect(isTauriEnvironment()).toBe(false)
    ;(window as Window & { __TAURI__?: unknown }).__TAURI__ = {}
    expect(isTauriEnvironment()).toBe(true)
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__
    ;(window as Window & { __STATUS_BAR_HEIGHT__?: unknown }).__STATUS_BAR_HEIGHT__ = 24
    expect(isTauriEnvironment()).toBe(true)
  })

  it('dispatches the browser exit event and removes its fallback iframe', () => {
    const listener = vi.fn()
    window.addEventListener('app-exit-request', listener)
    requestAppExit()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(document.querySelector('iframe')).toBeNull()
    vi.advanceTimersByTime(100)
    expect(document.querySelector('iframe')).not.toBeNull()
    vi.advanceTimersByTime(1_000)
    expect(document.querySelector('iframe')).toBeNull()
    window.removeEventListener('app-exit-request', listener)
  })

  it('uses injected status-bar height, CSS fallback, and browser default paths', () => {
    ;(window as Window & { __STATUS_BAR_HEIGHT__?: unknown }).__STATUS_BAR_HEIGHT__ = 28
    expect(detectStatusBarHeight()).toBe(28)
    expect(useUIStore.getState().statusBarHeight).toBe(28)
    expect(document.documentElement.style.getPropertyValue('--status-bar-height')).toBe('28px')

    delete (window as Window & { __STATUS_BAR_HEIGHT__?: unknown }).__STATUS_BAR_HEIGHT__
    expect(detectStatusBarHeight()).toBe(0)
    expect(useUIStore.getState().statusBarHeight).toBe(0)
    expect(document.documentElement.style.getPropertyValue('--status-bar-height')).toBe('0px')
  })

  it('listens for status-bar updates and cleans up the listener', () => {
    const remove = listenStatusBarUpdates()
    window.dispatchEvent(new CustomEvent('status-bar-height-updated', { detail: { heightPx: 19 } }))
    expect(useUIStore.getState().statusBarHeight).toBe(19)
    expect((window as Window & { __STATUS_BAR_HEIGHT__?: unknown }).__STATUS_BAR_HEIGHT__).toBe(19)
    remove()
    window.dispatchEvent(new CustomEvent('status-bar-height-updated', { detail: { heightPx: 22 } }))
    expect(useUIStore.getState().statusBarHeight).toBe(19)
  })

  it('handles back-button custom events and invokes app exit only for exit results', () => {
    const handler = vi.fn().mockReturnValueOnce('handled').mockReturnValueOnce('exit-app')
    const exitSpy = vi.spyOn(window, 'dispatchEvent')
    const remove = listenBackButton(handler)

    window.dispatchEvent(new CustomEvent('back-button-pressed'))
    window.dispatchEvent(new CustomEvent('back-button-pressed'))
    expect(handler).toHaveBeenCalledTimes(2)
    expect(exitSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app-exit-request' }))
    remove()
  })
})
