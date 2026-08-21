import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import { useAuthStore } from '../../stores'
import { authAPI, initUserData } from '../../api'
import { BackButton } from '../../components'
import { describeApiError, getApiErrorMessage } from '../../utils/apiError'
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
    } catch (error) {
      console.error('[AddAccount] Error occurred:', describeApiError(error))

      Toast.show(getApiErrorMessage(error, {
        statusMessages: { 401: '邮箱或密码错误', 500: '服务器内部错误' },
        fallback: '登录失败，请重试',
        preferField: 'message',
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
