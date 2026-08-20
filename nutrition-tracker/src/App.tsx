import { useEffect, useRef, useMemo } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { ConfigProvider, Toast } from 'antd-mobile'
import { initTheme, useAuthStore, useThemeStore, useOperationStore, useUIStore, handleBackButton } from './stores'
import HomePage from './pages/Home'
import GoalSettingPage from './pages/GoalSetting'
import CycleGoalPage from './pages/GoalSetting/CycleGoal'
import DailyGoalPage from './pages/GoalSetting/DailyGoal'
import CreateFoodPage from './pages/Foods/Create'
import EditFoodPage from './pages/Foods/Edit'
import CreatePlanPage from './pages/Foods/CreatePlan'
import EditPlanPage from './pages/Plans/EditPlan'
import AddRecordPage from './pages/AddRecord'
import FoodLibraryPage from './pages/FoodLibrary'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import ForgotPasswordPage from './pages/ForgotPassword'
import AddAccountPage from './pages/AddAccount'
import AccountInfoPage from './pages/AccountInfo'
import MetabolismPage from './pages/Metabolism'
import ProfilePage from './pages/Profile'
import { useSwipeGesture } from './hooks/useSwipeGesture'
import {
  detectStatusBarHeight,
  listenBackButton,
  listenStatusBarUpdates,
  requestAppExit,
} from './utils/tauriBridge'
import { Popup } from 'antd-mobile'
import './styles/global.css'

initTheme()

function AutoLogin() {
  const { isLoggedIn, isLocalAccount, login } = useAuthStore()
  const startPolling = useOperationStore(state => state.startPolling)
  const stopPolling = useOperationStore(state => state.stopPolling)

  useEffect(() => {
    const token = localStorage.getItem('auth-storage')
    if (token && !isLoggedIn) {
      try {
        const parsed = JSON.parse(token)
        if (parsed.state?.token) {
          login(parsed.state.token, parsed.state.user)
        }
      } catch {
        // ignore
      }
    }
  }, [isLoggedIn, login])

  useEffect(() => {
    if (isLoggedIn && !isLocalAccount) {
      startPolling()
    } else {
      stopPolling()
    }
  }, [isLoggedIn, isLocalAccount, startPolling, stopPolling])

  return null
}

/**
 * 全局 UI 行为容器：
 *  - 状态栏高度探测
 *  - 手势监听（右滑开 Profile、左滑关 Profile）
 *  - 监听路由变化：记录入口关系、自动关闭 Profile
 *  - 监听返回按钮消息
 *  - 全局 Profile 抽屉
 */
function GlobalUI() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showProfileDrawer, setShowProfileDrawer, pushRouteEntry, isAuthRoute } = useUIStore()

  // 用ref保存上一次的pathname，以便在变化时记录入口关系
  const prevPathRef = useRef<string>(location.pathname)

  // 1. 启用全局手势（传入当前路径，正确判断是否为首页）
  useSwipeGesture(location.pathname)

  // 2. 探测状态栏高度
  useEffect(() => {
    detectStatusBarHeight()
    const unlistenStatusBar = listenStatusBarUpdates()
    return unlistenStatusBar
  }, [])

  // 3. 监听路由变化：记录入口关系 + 自动关闭 Profile
  useEffect(() => {
    const prevPath = prevPathRef.current
    const currentPath = location.pathname

    // 只在路径真正变化时处理
    if (prevPath !== currentPath) {
      // 3a. 自动关闭 Profile 抽屉（当导航到认证页面时）
      if (isAuthRoute(currentPath)) {
        setShowProfileDrawer(false)
      }

      // 3b. 记录入口关系
      pushRouteEntry(currentPath, prevPath)

      // 3c. 更新 ref
      prevPathRef.current = currentPath
    }
  }, [location.pathname, pushRouteEntry, setShowProfileDrawer, isAuthRoute])

  // 4. 监听返回按钮消息
  useEffect(() => {
    const unlisten = listenBackButton(() => {
      const result = handleBackButton(
        location.pathname,
        window.history.length > 1,
        () => navigate(-1),
        (to, opts) => navigate(to, opts)
      )
      switch (result) {
        case 'close-drawer':
          break
        case 'toast-exit':
          Toast.show({
            content: '再按一次退出应用',
            position: 'bottom',
            duration: 1000,
          })
          break
        case 'exit-app':
          Toast.show({
            content: '正在退出...',
            position: 'bottom',
            duration: 500,
          })
          setTimeout(() => requestAppExit(), 300)
          break
        case 'navigate-entry':
        case 'navigate-back':
        case 'handled':
        default:
          break
      }
      return result
    })

    return unlisten
  }, [navigate, location.pathname])

  // 5. 全局 Profile 抽屉
  return (
    <Popup
      visible={showProfileDrawer}
      onMaskClick={() => setShowProfileDrawer(false)}
      position="left"
      bodyStyle={{ width: '340px', height: '100%' }}
    >
      <ProfilePage />
    </Popup>
  )
}

function AppContent() {
  const { mode } = useThemeStore()

  const config = useMemo(() => {
    const effectiveTheme = mode === 'system' 
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode
    
    if (effectiveTheme === 'dark') {
      return {
        colorPrimary: '#69c0ff',
        colorSuccess: '#73d13d',
        colorWarning: '#ffc53d',
        colorError: '#ff4d4f',
        colorText: '#ffffff',
        colorTextSecondary: '#cccccc',
        colorTextPlaceholder: '#666666',
        colorBg: '#1a1a1a',
        colorBgSecondary: '#242424',
        colorBorder: '#3d3d3d',
      }
    }
    
    return {
      colorPrimary: '#1677ff',
      colorSuccess: '#52c41a',
      colorWarning: '#faad14',
      colorError: '#f5222d',
      colorText: '#333333',
      colorTextSecondary: '#666666',
      colorTextPlaceholder: '#999999',
      colorBg: '#ffffff',
      colorBgSecondary: '#ffffff',
      colorBorder: '#e5e5e5',
    }
  }, [mode])

  return (
    <ConfigProvider {...config}>
      <AutoLogin />
      <GlobalUI />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/goal-setting" element={<GoalSettingPage />} />
        <Route path="/goal-setting/cycle/:id?" element={<CycleGoalPage />} />
        <Route path="/goal-setting/daily/:id?" element={<DailyGoalPage />} />
        <Route path="/food-library" element={<FoodLibraryPage />} />
        <Route path="/record" element={<AddRecordPage />} />
        <Route path="/foods/create-item" element={<CreateFoodPage />} />
        <Route path="/foods/edit/:id" element={<EditFoodPage />} />
        <Route path="/foods/create-plan" element={<CreatePlanPage />} />
        <Route path="/plans/edit/:id" element={<EditPlanPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/add-account" element={<AddAccountPage />} />
        <Route path="/account-info" element={<AccountInfoPage />} />
        <Route path="/metabolism" element={<MetabolismPage />} />
      </Routes>
    </ConfigProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
