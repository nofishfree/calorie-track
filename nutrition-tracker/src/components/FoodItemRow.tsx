import { EditSOutline, CloseOutline, AddOutline } from 'antd-mobile-icons'
import { Tag } from 'antd-mobile'
import styles from './FoodItemRow.module.css'

export interface FoodItemRowProps {
  name: string
  calories: number
  servingText: string
  tags?: { text: string; color: string }[]
  lastModifiedBy?: string
  usageCount?: number
  showEdit?: boolean
  showDelete?: boolean
  showAdd?: boolean
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
  onAdd?: () => void
}

const fmt = (n: number) => String(parseFloat(n.toFixed(1)))

export default function FoodItemRow({
  name,
  calories,
  servingText,
  tags,
  lastModifiedBy,
  usageCount,
  showEdit = false,
  showDelete = false,
  showAdd = false,
  onClick,
  onEdit,
  onDelete,
  onAdd,
}: FoodItemRowProps) {
  return (
    <div className={styles.foodItem} onClick={onClick}>
      <div className={styles.foodInfo}>
        <div className={styles.foodNameRow}>
          <span className={styles.foodName}>{name}</span>
          {tags?.map((tag, index) => (
            <Tag key={index} color={tag.color} style={{ marginLeft: 8 }}>
              {tag.text}
            </Tag>
          ))}
        </div>
        <div className={styles.foodMeta}>
          <span className={styles.foodCal}>
            {fmt(calories)} 千卡 / {servingText}
          </span>
          {usageCount !== undefined && usageCount > 0 && (
            <span className={styles.usageCount}>
              使用 {usageCount} 次
            </span>
          )}
          {lastModifiedBy && (
            <span className={styles.lastModifiedBy}>
              {lastModifiedBy}
            </span>
          )}
        </div>
      </div>
      {(showEdit || showDelete || showAdd) && (
        <div className={styles.foodActions}>
          {showAdd && (
            <button
              className={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation()
                onAdd?.()
              }}
            >
              <AddOutline fontSize={18} />
            </button>
          )}
          {showEdit && (
            <button
              className={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation()
                onEdit?.()
              }}
            >
              <EditSOutline fontSize={18} />
            </button>
          )}
          {showDelete && (
            <button
              className={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.()
              }}
            >
              <CloseOutline fontSize={18} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

