import { useMemo } from 'react'
import ProgressBar from './ProgressBar'
import styles from './NutrientCards.module.css'

interface Props {
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
  goal: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
}

const NUTRIENTS = [
  { key: 'carbs', name: '碳水', unit: 'g', color: '#f39c12' },
  { key: 'protein', name: '蛋白质', unit: 'g', color: '#3498db' },
  { key: 'fat', name: '脂肪', unit: 'g', color: '#e74c3c' },
]

export default function NutrientCards({ nutrition, goal }: Props) {
  const nutrients = useMemo(() => {
    return NUTRIENTS.map((info) => ({
      ...info,
      current: nutrition[info.key as keyof typeof nutrition],
      target: goal[info.key as keyof typeof goal],
      percent: Math.min(
        Math.round(
          (nutrition[info.key as keyof typeof nutrition] /
            goal[info.key as keyof typeof goal]) *
            100
        ),
        100
      ),
    }))
  }, [nutrition, goal])

  return (
    <div className={styles.container}>
      {nutrients.map((nutrient) => (
        <div key={nutrient.key} className={styles.item}>
          <div className={styles.header}>
            <span className={styles.name}>{nutrient.name}</span>
            <span className={styles.value}>
              {String(parseFloat(nutrient.current.toFixed(1)))}/{String(parseFloat(nutrient.target.toFixed(1)))}{nutrient.unit}
            </span>
          </div>
          <ProgressBar
            percent={nutrient.percent}
            color={nutrient.color}
          />
        </div>
      ))}
    </div>
  )
}

