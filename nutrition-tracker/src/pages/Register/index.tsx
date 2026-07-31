import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import { useAuthStore } from '../../stores'
import { authAPI } from '../../api'
import styles from './index.module.css'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuthStore()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      Toast.show('请填写完整信息')
      return
    }
    
    if (password !== confirmPassword) {
      Toast.show('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      console.log('[Register] Attempting to register with:', { email, username })
      
      const response: any = await authAPI.register(email, password, username)
      
      console.log('[Register] Response received:', JSON.stringify(response, null, 2))
      
      if (response?.data?.token && response?.data?.user) {
        login(response.data.token, response.data.user)
        Toast.show('注册成功')
        navigate('/profile')
      } else if (response?.message) {
        Toast.show(response.message)
      } else {
        Toast.show('注册失败，请重试')
      }
    } catch (error: any) {
      console.error('[Register] Error occurred:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      })
      
      if (error.response?.data?.error) {
        Toast.show(error.response.data.error)
      } else if (error.response?.status === 409) {
        Toast.show('该邮箱已被注册')
      } else if (error.message?.includes('Network Error')) {
        Toast.show('网络连接失败，请检查网络')
      } else {
        Toast.show('注册失败，请重试')
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
        <h1 className={styles.title}>注册账号</h1>
        <p className={styles.subtitle}>创建账号，同步您的饮食记录</p>
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
        
        <Input
          placeholder="确认密码"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          className={styles.input}
        />
        
        <Input
          placeholder="用户名（可选）"
          value={username}
          onChange={setUsername}
          className={styles.input}
        />

        <Button
          block
          color="primary"
          size="large"
          loading={loading}
          onClick={handleRegister}
        >
          注册
        </Button>
      </div>
    </div>
  )
}
