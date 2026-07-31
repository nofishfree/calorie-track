import styles from './ProgressBar.module.css'

interface Props {
  percent: number
  color?: string
  trackColor?: string
}

export default function ProgressBar({ percent, color = '#ff6b6b', trackColor = '#e8e8e8' }: Props) {
  return (
    <div className={styles.container}>
      <div
        className={styles.track}
        style={{ backgroundColor: trackColor }}
      >
        <div
          className={styles.fill}
          style={{
            width: `${Math.min(percent, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}

