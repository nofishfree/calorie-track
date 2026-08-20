import { useEffect, useRef } from 'react'
import { useUIStore } from '../stores'

/**
 * 全局手势Hook：
 *  - 从屏幕左边缘右滑 (dx > 阈值) → 拉出 Profile 抽屉（仅在主页触发）
 *  - 当 Profile 抽屉打开时，在屏幕上左滑 (dx < -阈值) → 收回抽屉
 *
 * 使用原生 touchstart/touchmove/touchend 事件，无需额外依赖。
 *
 * @param currentPathname 当前路由路径（来自React Router的useLocation）
 */
export function useSwipeGesture(currentPathname: string) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const edgeZoneRef = useRef<number>(30)
  const minDistanceRef = useRef<number>(60)
  const maxDurationRef = useRef<number>(500)
  const maxYDeviationRef = useRef<number>(80)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }
    }

    const onTouchEnd = (e: TouchEvent) => {
      const start = touchStartRef.current
      if (!start || e.changedTouches.length !== 1) {
        touchStartRef.current = null
        return
      }

      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const dt = Date.now() - start.time
      touchStartRef.current = null

      // 只处理水平为主且在时间窗口内的滑动
      if (dt > maxDurationRef.current) return
      if (Math.abs(dy) > maxYDeviationRef.current) return
      if (Math.abs(dx) < minDistanceRef.current) return

      const { showProfileDrawer, setShowProfileDrawer, isHomeRoute } = useUIStore.getState()

      // 1. 从左边缘右滑 → 打开抽屉（仅在主页、抽屉未打开时触发）
      if (dx > 0 && !showProfileDrawer) {
        if (start.x <= edgeZoneRef.current && isHomeRoute(currentPathname)) {
          setShowProfileDrawer(true)
          return
        }
      }

      // 2. 抽屉打开时，在屏幕任意位置左滑 → 关闭抽屉
      if (dx < 0 && showProfileDrawer) {
        setShowProfileDrawer(false)
        return
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [currentPathname])
}
