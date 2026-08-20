import { useUIStore } from '../stores'

/**
 * 判断当前是否运行在 Tauri / WebView (Android APK) 环境中
 * 兼容 __TAURI__ 标识和我们自定义的 __STATUS_BAR_HEIGHT__ 注入
 */
export function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false
  const win = window as any
  return !!win.__TAURI__ || typeof win.__STATUS_BAR_HEIGHT__ === 'number'
}

/**
 * 请求退出应用：
 *  - 发送 CustomEvent('app-exit-request') -> Android MainActivity 拦截 URL scheme
 *  - 兜底尝试 Tauri window API
 */
export function requestAppExit() {
  try {
    // 方式1：触发 CustomEvent，Android 端监听后通过 location.href = 'tauri-app://exit' 关闭
    const ev = new CustomEvent('app-exit-request', { detail: { source: 'frontend' } })
    window.dispatchEvent(ev)

    // 方式2：兜底直接尝试 URL scheme（部分 Android WebView 版本可能直接走这里）
    setTimeout(() => {
      try {
        // 使用不可见 iframe 触发，避免污染 history
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = 'tauri-app://exit'
        document.documentElement.appendChild(iframe)
        setTimeout(() => iframe.remove(), 1000)
      } catch {
        // ignore
      }
    }, 100)

    // 方式3：Tauri 原生 API
    const win = window as any
    if (win.__TAURI__?.window?.appWindow?.close) {
      try {
        win.__TAURI__.window.appWindow.close()
      } catch {
        // ignore
      }
    } else if (win.__TAURI__?.process?.exit) {
      try {
        win.__TAURI__.process.exit(0)
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 检测状态栏高度并设置到 store 中
 * 优先级：
 *   1. Android MainActivity 注入的 window.__STATUS_BAR_HEIGHT__（最准确）
 *   2. CSS env(safe-area-inset-top) 探测（iOS WebView 及部分浏览器）
 *   3. 默认值 0
 */
export function detectStatusBarHeight(): number {
  // 1. 优先使用 Android 原生端注入值（包含刘海屏高度）
  const win = window as any
  if (typeof win.__STATUS_BAR_HEIGHT__ === 'number' && win.__STATUS_BAR_HEIGHT__ > 0) {
    const height = win.__STATUS_BAR_HEIGHT__ as number
    useUIStore.getState().setStatusBarHeight(height)
    applyStatusBarCSSVar(height)
    return height
  }

  // 2. 使用 CSS env 探测：创建一个隐藏元素读取 safe-area-inset-top
  try {
    const probe = document.createElement('div')
    probe.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 1px',
      'height: env(safe-area-inset-top, 0px)',
      'pointer-events: none',
      'visibility: hidden',
      'z-index: -1',
    ].join(';')
    document.documentElement.appendChild(probe)
    const computed = window.getComputedStyle(probe)
    const heightStr = computed.getPropertyValue('height') || '0px'
    const height = parseFloat(heightStr) || 0
    document.documentElement.removeChild(probe)
    if (height > 0) {
      useUIStore.getState().setStatusBarHeight(height)
      applyStatusBarCSSVar(height)
      return height
    }
  } catch {
    // ignore
  }

  // 3. 默认值
  useUIStore.getState().setStatusBarHeight(0)
  applyStatusBarCSSVar(0)
  return 0
}

/** 将状态栏高度写入全局 CSS 变量（供所有页面样式使用） */
function applyStatusBarCSSVar(heightPx: number) {
  try {
    const root = document.documentElement
    root.style.setProperty('--status-bar-height', `${heightPx}px`)
    root.style.setProperty(
      '--safe-area-top',
      `max(env(safe-area-inset-top, 0px), ${heightPx}px)`
    )
    root.style.setProperty(
      '--page-top-padding',
      `max(env(safe-area-inset-top, 0px), ${heightPx}px)`
    )
  } catch {
    // ignore
  }
}

/**
 * 监听状态栏高度变化事件（Android 端在 onResume 时派发）
 */
export function listenStatusBarUpdates(): () => void {
  const handler = (e: Event) => {
    const ev = e as CustomEvent
    const height = ev.detail?.heightPx as number | undefined
    if (typeof height === 'number' && height >= 0) {
      const win = window as any
      win.__STATUS_BAR_HEIGHT__ = height
      useUIStore.getState().setStatusBarHeight(height)
      applyStatusBarCSSVar(height)
    }
  }
  window.addEventListener('status-bar-height-updated', handler as any)
  return () => window.removeEventListener('status-bar-height-updated', handler as any)
}

/**
 * 监听来自 Tauri / Android 端的返回按钮消息
 *   - Android: 通过 evaluateJavascript 派发 CustomEvent('back-button-pressed')
 *   - 桌面/调试: 也可以通过 CustomEvent 手动触发模拟
 */
export function listenBackButton(
  handler: () => 'navigate-entry' | 'navigate-back' | 'navigate' | 'close-drawer' | 'toast-exit' | 'exit-app' | 'handled'
): () => void {
  const tauriHandler = () => {
    const result = handler()
    // 如果返回 'exit-app'，真正关闭应用
    if (result === 'exit-app') {
      requestAppExit()
    }
  }

  // 监听 Tauri event plugin（若有）
  let tauriUnlisten: (() => void) | null = null
  const win = window as any
  if (win.__TAURI__?.event?.listen) {
    win.__TAURI__.event
      .listen('back-button-pressed', () => tauriHandler())
      .then((u: () => void) => {
        tauriUnlisten = u
      })
      .catch(() => {
        // ignore
      })
  }

  // 监听通用 window CustomEvent（Android 实际使用此方式 + 调试模拟）
  const customHandler = (e: Event) => {
    const ev = e as CustomEvent
    if (!ev.detail || ev.detail.type === 'back-button-pressed') {
      tauriHandler()
    }
  }
  window.addEventListener('tauri://event', customHandler as any)
  window.addEventListener('back-button-pressed', customHandler as any)

  return () => {
    if (tauriUnlisten) tauriUnlisten()
    window.removeEventListener('tauri://event', customHandler as any)
    window.removeEventListener('back-button-pressed', customHandler as any)
  }
}
