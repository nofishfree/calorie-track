import { useEffect, useMemo } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider } from 'antd-mobile'
import { initTheme, useAuthStore, useThemeStore, useOperationStore } from './stores'
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
import './styles/global.css'

initTheme()

function AutoLogin() {
  const { isLoggedIn, isLocalAccount, login } = useAuthStore()
  const startPolling = useOperationStore(state => state.startPolling)
  const stopPolling = useOperationStore(state => state.stopPolling)

  // 从 localStorage 恢复登录状态
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

  // 根据登录状态统一管理轮询：已登录且非本地账号时启动，否则停止
  useEffect(() => {
    if (isLoggedIn && !isLocalAccount) {
      startPolling()
    } else {
      stopPolling()
    }
  }, [isLoggedIn, isLocalAccount, startPolling, stopPolling])

  return null
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

