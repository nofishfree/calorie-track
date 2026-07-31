import { EditSOutline, CloseOutline } from 'antd-mobile-icons'
import type { MealRecord } from '../types'
import dayjs from 'dayjs'
import styles from './RecordCard.module.css'

interface Props {
  record: MealRecord
  onEdit: () => void
  onDelete: () => void
  servingText?: string
}

export default function RecordCard({ record, onEdit, onDelete, servingText }: Props) {
  const fmt = (n: number) => String(parseFloat(n.toFixed(1)))
  const time = dayjs(record.record_time).format('HH:mm')
  const defaultServingText = `${fmt(record.serving_count * record.food.num)} ${record.food.unit || 'g'}`
  const displayServingText = servingText || defaultServingText
  const isQuickAdd = record.is_quick_add
  return (
    <div className={styles.card}>
      <span className={styles.time}>{time}</span>
      <div className={styles.nameContainer}>
        <div className={isQuickAdd ? styles.nameQuickAdd : styles.name}>{record.food.name || '未知'}</div>
      </div>
      {!isQuickAdd && <span className={styles.serving}>{displayServingText}</span>}
      {record.calories_total >= 0 && <span className={isQuickAdd ? styles.caloriesQuickAdd : styles.calories}>{fmt(record.calories_total)} 千卡</span>}
      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={onEdit}
        >
          <EditSOutline fontSize={18} />
        </button>
        <button
          className={styles.actionBtn}
          onClick={onDelete}
        >
          <CloseOutline fontSize={18} />
        </button>
      </div>
    </div>
  )
}

