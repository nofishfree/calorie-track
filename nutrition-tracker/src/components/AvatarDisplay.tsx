import { useState, useEffect } from 'react'
import { avatarStore } from '../stores/avatarStore'

interface AvatarDisplayProps {
  hash?: string | null
  size?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * 头像显示组件
 * - 从 IndexedDB 加载头像数据
 * - 本地不存在时从服务器获取
 * - 显示默认头像图标作为 fallback
 */
export function AvatarDisplay({ hash, size = 48, className, style }: AvatarDisplayProps) {
  const [avatarData, setAvatarData] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hash) {
      setAvatarData(null)
      return
    }

    let mounted = true

    async function loadAvatar() {
      setLoading(true)
      try {
        const data = await avatarStore.getOrFetchAvatar(hash)
        if (mounted) {
          setAvatarData(data)
        }
      } catch (error) {
        console.error('Failed to load avatar:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadAvatar()

    return () => {
      mounted = false
    }
  }, [hash])

  if (!hash || (!avatarData && !loading)) {
    // 显示默认头像图标
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: 'var(--bg-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          overflow: 'hidden',
          ...style,
        }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width={size * 0.8} height={size * 0.8}>
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>
    )
  }

  if (loading) {
    // 显示加载状态（灰色圆形）
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: 'var(--bg-color)',
          ...style,
        }}
      />
    )
  }

  // 显示头像图片
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-color)',
        ...style,
      }}
    >
      {avatarData && (
        <img
          src={avatarData}
          alt="头像"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
    </div>
  )
}