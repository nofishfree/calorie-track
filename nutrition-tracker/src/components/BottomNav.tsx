import { useLocation, useNavigate } from 'react-router-dom'
import styles from './BottomNav.module.css'

const navItems = [
  { path: '/', icon: 'home', label: '今日' },
  { path: '/stats', icon: 'chart', label: '统计' },
  { path: '/profile', icon: 'user', label: '我的' },
]

const icons: Record<string, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M3 13h4v8H3v-8zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  ),
}

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => {
        const isActive = location.pathname === item.path
        return (
          <button
            key={item.path}
            className={`${styles.item} ${isActive ? styles.active : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className={styles.icon}>{icons[item.icon]}</span>
            <span className={styles.label}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

