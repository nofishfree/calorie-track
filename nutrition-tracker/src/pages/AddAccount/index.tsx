import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import { useAuthStore } from '../../stores'
import { authAPI, initUserData } from '../../api'
import styles from './index.module.css'

export default function AddAccountPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      Toast.show('请填写邮箱和密码')
      return
    }

    setLoading(true)
    try {
      console.log('[AddAccount] Attempting to login with:', { email, passwordLength: password.length })
      
      const response: any = await authAPI.login(email, password)
      
      console.log('[AddAccount] Response received:', JSON.stringify(response, null, 2))
      console.log('[AddAccount] Response type:', typeof response)
      console.log('[AddAccount] Has token:', !!response?.token)
      console.log('[AddAccount] Has user:', !!response?.user)
      
      if (response && response.data && response.data.token && response.data.user) {
        console.log('[AddAccount] Using nested data structure')
        login(response.data.token, response.data.user)
        // 等待初始数据加载完成后再跳转
        const result = await initUserData(response.data.user.id)
        // 跳转到今日页
        navigate('/', { replace: true })
        Toast.show(result.success ? '账号添加成功' : '账号添加成功，但数据加载不完整')
      } else if (response && response.token && response.user) {
        console.log('[AddAccount] Using direct response structure')
        login(response.token, response.user)
        // 等待初始数据加载完成后再跳转
        const result = await initUserData(response.user.id)
        // 跳转到今日页
        navigate('/', { replace: true })
        Toast.show(result.success ? '账号添加成功' : '账号添加成功，但数据加载不完整')
      } else {
        console.error('[AddAccount] Unexpected response structure:', response)
        Toast.show('登录失败，请检查邮箱和密码')
      }
    } catch (error: any) {
      console.error('[AddAccount] Error occurred:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        fullError: error,
      })
      
      if (error.response?.data?.message) {
        Toast.show(error.response.data.message)
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
        <p className={styles.subtitle}>添加新账号</p>
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
          添加账号
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
