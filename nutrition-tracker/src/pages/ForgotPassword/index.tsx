import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Toast } from 'antd-mobile'
import styles from './index.module.css'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = async () => {
    if (!email) {
      Toast.show('请输入邮箱')
      return
    }

    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      Toast.show('验证码已发送')
      setStep(2)
    } catch {
      Toast.show('发送失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (!code || !newPassword) {
      Toast.show('请填写完整信息')
      return
    }

    setLoading(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      Toast.show('密码已重置')
      setStep(3)
    } catch {
      Toast.show('重置失败，请重试')
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
        <h1 className={styles.title}>忘记密码</h1>
      </div>

      <div className={styles.form}>
        {step === 1 && (
          <>
            <Input
              placeholder="输入您的邮箱"
              type="email"
              value={email}
              onChange={setEmail}
              className={styles.input}
            />
            <Button
              block
              color="primary"
              size="large"
              loading={loading}
              onClick={handleSendCode}
            >
              获取验证码
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <Input
              placeholder="输入验证码"
              value={code}
              onChange={setCode}
              className={styles.input}
            />
            <Input
              placeholder="新密码"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              className={styles.input}
            />
            <Button
              block
              color="primary"
              size="large"
              loading={loading}
              onClick={handleReset}
            >
              确认重置
            </Button>
          </>
        )}

        {step === 3 && (
          <div className={styles.success}>
            <div className={styles.checkIcon}>✓</div>
            <p className={styles.successText}>密码重置成功</p>
            <Button
              block
              color="primary"
              size="large"
              onClick={() => navigate('/login')}
            >
              返回登录
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
