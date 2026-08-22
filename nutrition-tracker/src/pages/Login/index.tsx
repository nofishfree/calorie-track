import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import { useAuthStore } from '../../stores'
import { authAPI, initUserData } from '../../api'
import { BackButton } from '../../components'
import { describeApiError, getApiErrorMessage } from '../../utils/apiError'
import styles from './index.module.css'

const LAST_EMAIL_KEY = 'last_login_email'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()

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
        
        // 等待初始数据加载完成后再跳转
        const result = await initUserData(response.data.user.id)

        // 跳转页面
        navigate('/', { replace: true })
        
        if (result.success) {
          Toast.show('登录成功')
        } else {
          Toast.show('登录成功，但数据加载不完整')
        }
      } else {
        console.error('[Login] Unexpected response structure:', response)
        Toast.show('登录失败，请检查邮箱和密码')
      }
    } catch (error) {
      console.error('[Login] Error occurred:', describeApiError(error))

      Toast.show(getApiErrorMessage(error, {
        statusMessages: { 401: '邮箱或密码错误', 500: '服务器内部错误' },
        fallback: '登录失败，请重试',
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate(-1)
  }

  return (
    <div className={styles.container}>
      <BackButton className={styles.backBtn} onClick={handleBack} />

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
