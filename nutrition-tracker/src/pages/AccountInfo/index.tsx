import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Toast } from 'antd-mobile'
import { useAuthStore } from '../../stores'
import { useOperationStore } from '../../stores/operationStore'
import { avatarStore, computeHash } from '../../stores/avatarStore'
import styles from './index.module.css'

export default function AccountInfoPage() {
  const navigate = useNavigate()
  const { user, isLocalAccount, updateUser } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [username, setUsername] = useState(user?.username || user?.email || '')
  // avatarHash: 当前头像的哈希值（存储在 user.avatar 中）
  const [avatarHash, setAvatarHash] = useState(user?.avatar || '')
  // avatarData: 当前显示的 base64 数据（从 IndexedDB 加载）
  const [avatarData, setAvatarData] = useState<string>('')

  // 页面加载时，从 IndexedDB 获取头像数据
  useEffect(() => {
    async function loadAvatar() {
      if (user?.avatar) {
        const data = await avatarStore.getAvatar(user.avatar)
        if (data) {
          setAvatarData(data)
        } else {
          // 本地不存在，尝试从服务器获取
          const fetchedData = await avatarStore.getOrFetchAvatar(user.avatar)
          if (fetchedData) {
            setAvatarData(fetchedData)
          }
        }
      }
    }
    loadAvatar()
  }, [user?.avatar])

  const handleBack = () => navigate(-1)

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      Toast.show('请选择图片文件')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      Toast.show('图片大小不能超过5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      const base64Data = reader.result as string

      // 计算 SHA-256 哈希值
      const hash = await computeHash(base64Data)

      // 保存到本地 IndexedDB
      await avatarStore.saveAvatar(hash, base64Data)

      // 更新本地状态
      setAvatarHash(hash)
      setAvatarData(base64Data)
    }
    reader.readAsDataURL(file)

    // 重置 input，允许再次选择同一文件
    e.target.value = ''
  }

  const handleSave = async () => {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      Toast.show('用户名不能为空')
      return
    }

    const updatedData = {
      username: trimmedUsername,
      avatar: avatarHash || undefined,  // 存储哈希值而非 base64
    }

    updateUser(updatedData)

    // 添加到操作队列，等待同步到服务器
    // 只包含哈希值，不包含 base64 数据（减少请求体大小）
    if (user) {
      useOperationStore.getState().addOperation(
        'account',
        {
          id: user.id,
          username: trimmedUsername,
          avatar: avatarHash || undefined,
        },
        'update'
      )
    }

    Toast.show('保存成功')
    navigate(-1)
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={handleBack}>‹</button>
        <span className={styles.title}>账号信息</span>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrapper} onClick={handleAvatarClick}>
            {avatarData ? (
              <img src={avatarData} alt="头像" className={styles.avatarImg} />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48" className={styles.avatarPlaceholder}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            )}
            <div className={styles.avatarOverlay}>上传头像</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <span className={styles.avatarHint}>点击头像上传，支持 jpg/png，最大5MB</span>
        </div>

        <div className={styles.formSection}>
          <div className={styles.formItem}>
            <span className={styles.formLabel}>用户名</span>
            <Input
              className={styles.nicknameInput}
              value={username}
              onChange={setUsername}
              placeholder="请输入用户名"
              clearable
            />
          </div>
          {!isLocalAccount && (
            <div className={styles.formItem}>
              <span className={styles.formLabel}>邮箱</span>
              <span className={styles.formValue}>{user?.email}</span>
            </div>
          )}
        </div>

        <button className={styles.saveBtn} onClick={handleSave}>
          保存
        </button>
      </div>
    </div>
  )
}