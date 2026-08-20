import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 路由入口记录
 * - path: 当前页面路径
 * - entryFrom: 进入该页面的入口路径
 */
interface RouteEntry {
  path: string
  entryFrom: string
}

interface UIState {
  // Profile抽屉状态
  showProfileDrawer: boolean
  setShowProfileDrawer: (show: boolean) => void

  // 退出提示相关
  lastBackPressedAt: number
  setLastBackPressedAt: (time: number) => void

  // 状态栏高度
  statusBarHeight: number
  setStatusBarHeight: (height: number) => void

  // 路由入口栈：记录每个页面的入口关系
  routeStack: RouteEntry[]
  pushRouteEntry: (pathname: string, prevPath: string) => void
  popRouteEntry: () => RouteEntry | null
  clearRouteStack: () => void
  getEntryForRoute: (pathname: string) => string | null

  // 辅助方法
  isHomeRoute: (pathname: string) => boolean
  isAuthRoute: (pathname: string) => boolean
}

// 根级路由（同级，导航到这些页面时应清空路由栈）
const ROOT_ROUTES = new Set(['/', '/login', '/register', '/forgot-password', '/add-account'])

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      showProfileDrawer: false,
      setShowProfileDrawer: (show) => set({ showProfileDrawer: show }),

      lastBackPressedAt: 0,
      setLastBackPressedAt: (time) => set({ lastBackPressedAt: time }),

      statusBarHeight: 0,
      setStatusBarHeight: (height: number) => set({ statusBarHeight: height }),

      routeStack: [],

      /**
       * 记录路由入口关系
       * - 当导航到根路由时，清空栈
       * - 否则将新入口推入栈
       */
      pushRouteEntry: (pathname, prevPath) => {
        const state = get()
        // 1. 根路由：清空栈
        if (ROOT_ROUTES.has(pathname)) {
          set({ routeStack: [] })
          return
        }
        // 2. 如果当前路径已经在栈中（页面刷新/直接访问），清空并重新建立
        const existingIndex = state.routeStack.findIndex(e => e.path === pathname)
        if (existingIndex >= 0) {
          set({ routeStack: state.routeStack.slice(0, existingIndex) })
        }
        // 3. 推入新的入口记录
        const entry: RouteEntry = {
          path: pathname,
          entryFrom: prevPath || '/',
        }
        set(state => ({ routeStack: [...state.routeStack, entry] }))
      },

      /**
       * 弹出栈顶入口（返回上一级时使用）
       */
      popRouteEntry: () => {
        const state = get()
        if (state.routeStack.length === 0) return null
        const last = state.routeStack[state.routeStack.length - 1]
        return last
      },

      clearRouteStack: () => set({ routeStack: [] }),

      /**
       * 获取某页面的入口路径
       */
      getEntryForRoute: (pathname) => {
        const state = get()
        const entry = state.routeStack.find(e => e.path === pathname)
        return entry?.entryFrom ?? null
      },

      isHomeRoute: (pathname) => pathname === '/' || pathname === '',

      isAuthRoute: (pathname) => {
        return ROOT_ROUTES.has(pathname)
      },
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        statusBarHeight: state.statusBarHeight,
      }),
    }
  )
)

/**
 * 处理返回按钮消息
 * 
 * 返回值说明：
 *   - 'navigate-entry': 跳转到入口页面（由调用方执行导航）
 *   - 'navigate-back': 使用浏览器历史回退
 *   - 'close-drawer': 只关闭了Profile抽屉
 *   - 'toast-exit': 显示"再按一次退出"提示
 *   - 'exit-app': 应该关闭应用
 *   - 'handled': 已处理
 */
export function handleBackButton(
  pathname: string,
  canGoBack: boolean,
  goBack: () => void,
  navigate: (to: string, opts?: { replace?: boolean }) => void
): 'navigate-entry' | 'navigate-back' | 'close-drawer' | 'toast-exit' | 'exit-app' | 'handled' {
  const state = useUIStore.getState()
  const now = Date.now()

  // 1. 如果Profile抽屉是打开的，先关闭抽屉
  if (state.showProfileDrawer) {
    state.setShowProfileDrawer(false)
    return 'close-drawer'
  }

  // 2. 主页的双按退出逻辑
  const isHome = state.isHomeRoute(pathname)
  if (isHome) {
    const lastPressed = state.lastBackPressedAt
    if (lastPressed > 0 && now - lastPressed <= 1000) {
      state.setLastBackPressedAt(0)
      return 'exit-app'
    } else {
      state.setLastBackPressedAt(now)
      return 'toast-exit'
    }
  }

  // 3. 认证页面（login/register等）：双按退出，或回到主页
  if (state.isAuthRoute(pathname)) {
    const lastPressed = state.lastBackPressedAt
    if (lastPressed > 0 && now - lastPressed <= 1000) {
      state.setLastBackPressedAt(0)
      return 'exit-app'
    } else {
      state.setLastBackPressedAt(now)
      return 'toast-exit'
    }
  }

  // 4. 其他页面：根据路由入口栈返回
  const entry = state.popRouteEntry()
  if (entry && entry.path === pathname) {
    // 命中栈顶，跳转到入口
    navigate(entry.entryFrom, { replace: false })
    return 'navigate-entry'
  }

  // 如果栈中找不到当前页面的记录，尝试在栈中查找
  const foundIndex = state.routeStack.findIndex(e => e.path === pathname)
  if (foundIndex >= 0) {
    // 从该位置弹出
    const found = state.routeStack[foundIndex]
    useUIStore.setState({ routeStack: state.routeStack.slice(0, foundIndex) })
    navigate(found.entryFrom, { replace: false })
    return 'navigate-entry'
  }

  // 5. 栈为空或找不到记录：使用浏览器历史回退（如果可用）
  if (canGoBack) {
    goBack()
    return 'navigate-back'
  }

  // 6. 兜底：回到主页
  navigate('/', { replace: true })
  return 'navigate-entry'
}
