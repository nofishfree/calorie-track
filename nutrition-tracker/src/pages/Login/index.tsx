import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import { useAuthStore, useOperationStore } from '../../stores'
import { authAPI } from '../../api'
import styles from './index.module.css'

const LAST_EMAIL_KEY = 'last_login_email'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const startPolling = useOperationStore(state => state.startPolling)
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const savedEmail = localStorage.getItem(LAST_EMAIL_KEY)
    if (savedEmail) {
      setEmail(savedEmail)
    }
  }, [])

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show('请填写邮箱和密码')
      return
    }

    setLoading(true)
    try {
      console.log('[Login] Attempting to login with:', { email, passwordLength: password.length })
      
      const response: any = await authAPI.login(email, password)
      
      console.log('[Login] Response received:', JSON.stringify(response, null, 2))
      
      if (response?.data?.token && response?.data?.user) {
        console.log('[Login] Using nested data structure')
        localStorage.setItem(LAST_EMAIL_KEY, email)
        login(response.data.token, response.data.user)
        // 登录成功后启动轮询同步
        startPolling()
        Toast.show('登录成功')
        navigate('/profile')
      } else {
        console.error('[Login] Unexpected response structure:', response)
        Toast.show('登录失败，请检查邮箱和密码')
      }
    } catch (error: any) {
      console.error('[Login] Error occurred:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        fullError: error,
      })
      
      if (error.response?.data?.error) {
        Toast.show(error.response.data.error)
      } else if (error.response?.status === 401) {
        Toast.show('邮箱或密码错误')
      } else if (error.response?.status === 500) {
        Toast.show('服务器内部错误')
      } else if (error.message?.includes('Network Error')) {
        Toast.show('网络连接失败，请检查网络')
      } else {
        Toast.show('登录失败，请重试')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate(-1)
  }

  return (
    <div className={styles.container}>
      <button className={styles.backBtn} onClick={handleBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>营养追踪</h1>
        <p className={styles.subtitle}>记录每日饮食，健康生活</p>
      </div>

      <div className={styles.form}>
        <Input
          placeholder="邮箱"
          type="email"
          value={email}
          onChange={setEmail}
          className={styles.input}
        />
        
        <Input
          placeholder="密码"
          type="password"
          value={password}
          onChange={setPassword}
          className={styles.input}
        />

        <Button
          block
          color="primary"
          size="large"
          loading={loading}
          onClick={handleLogin}
        >
          登录
        </Button>

        <div className={styles.links}>
          <button className={styles.link} onClick={() => navigate('/register')}>
            注册账号
          </button>
          <button className={styles.link} onClick={() => navigate('/forgot-password')}>
            忘记密码
          </button>
        </div>
      </div>
    </div>
  )
}
