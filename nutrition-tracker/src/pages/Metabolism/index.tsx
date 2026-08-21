import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from 'antd-mobile'
import { sanitizeNumberInput } from '../../utils/nutrition'
import styles from './index.module.css'

type Gender = 'male' | 'female'

interface ActivityLevel {
  key: string
  name: string
  desc: string
  multiplier: number
}

const ACTIVITY_LEVELS: ActivityLevel[] = [
  { key: 'sedentary', name: '久坐', desc: '办公室工作，几乎不运动', multiplier: 1.2 },
  { key: 'light', name: '轻度活动', desc: '每周1-3次轻度运动', multiplier: 1.375 },
  { key: 'moderate', name: '中度活动', desc: '每周3-5次中度运动', multiplier: 1.55 },
  { key: 'active', name: '高度活动', desc: '每周6-7次剧烈运动', multiplier: 1.725 },
  { key: 'very_active', name: '非常高度活动', desc: '体力工作或每天训练', multiplier: 1.9 },
]

const validateNumberInput = (val: string): string => sanitizeNumberInput(val)

export default function MetabolismPage() {
  const navigate = useNavigate()
  const [gender, setGender] = useState<Gender>('male')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [activityKey, setActivityKey] = useState('sedentary')

  const heightNum = parseFloat(height) || 0
  const weightNum = parseFloat(weight) || 0
  const ageNum = parseInt(age) || 0

  // Mifflin-St Jeor 公式
  const bmr = (() => {
    if (heightNum <= 0 || weightNum <= 0 || ageNum <= 0) return 0
    const base = 10 * weightNum + 6.25 * heightNum - 5 * ageNum
    return gender === 'male' ? base + 5 : base - 161
  })()

  const activity = ACTIVITY_LEVELS.find(a => a.key === activityKey)!
  const tdee = Math.round(bmr * activity.multiplier)

  const canCalculate = heightNum > 0 && weightNum > 0 && ageNum > 0

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>‹</button>
        <span className={styles.title}>代谢计算</span>
        <span style={{ width: 40 }} />
      </header>

      <div className={styles.content}>
        <div className={styles.formSection}>
          <div className={styles.formItem}>
            <span className={styles.formLabel}>性别</span>
            <div className={styles.genderSelector}>
              <button
                className={`${styles.genderBtn} ${gender === 'male' ? styles.active : ''}`}
                onClick={() => setGender('male')}
              >
                男
              </button>
              <button
                className={`${styles.genderBtn} ${gender === 'female' ? styles.active : ''}`}
                onClick={() => setGender('female')}
              >
                女
              </button>
            </div>
          </div>

          <div className={styles.formItem}>
            <span className={styles.formLabel}>身高</span>
            <div className={styles.inputWithUnit}>
              <Input
                style={{ flex: 1, border: 'none' }}
                inputMode="decimal"
                value={height}
                onChange={(v) => setHeight(validateNumberInput(v))}
                placeholder="请输入身高"
              />
              <span className={styles.unit}>cm</span>
            </div>
          </div>

          <div className={styles.formItem}>
            <span className={styles.formLabel}>体重</span>
            <div className={styles.inputWithUnit}>
              <Input
                style={{ flex: 1, border: 'none' }}
                inputMode="decimal"
                value={weight}
                onChange={(v) => setWeight(validateNumberInput(v))}
                placeholder="请输入体重"
              />
              <span className={styles.unit}>kg</span>
            </div>
          </div>

          <div className={styles.formItem}>
            <span className={styles.formLabel}>年龄</span>
            <div className={styles.inputWithUnit}>
              <Input
                style={{ flex: 1, border: 'none' }}
                inputMode="decimal"
                value={age}
                onChange={(v) => setAge(validateNumberInput(v))}
                placeholder="请输入年龄"
              />
              <span className={styles.unit}>岁</span>
            </div>
          </div>

          <div className={styles.formItem}>
            <span className={styles.formLabel}>运动强度</span>
            <div className={styles.activitySelector}>
              {ACTIVITY_LEVELS.map((level) => (
                <button
                  key={level.key}
                  className={`${styles.activityBtn} ${activityKey === level.key ? styles.active : ''}`}
                  onClick={() => setActivityKey(level.key)}
                >
                  <span className={styles.activityName}>{level.name}</span>
                  <span className={styles.activityDesc}>{level.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {canCalculate && (
          <div className={styles.resultSection}>
            <div className={styles.resultLabel}>每日总能量消耗 (TDEE)</div>
            <div>
              <span className={styles.resultValue}>{tdee}</span>
              <span className={styles.resultUnit}>kcal</span>
            </div>
            <div className={styles.resultDetail}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>基础代谢 (BMR)</span>
                <span className={styles.detailValue}>{Math.round(bmr)} kcal</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>活动系数</span>
                <span className={styles.detailValue}>×{activity.multiplier}</span>
              </div>
            </div>
            <p className={styles.formulaHint}>
              Mifflin-St Jeor 公式<br />
              {gender === 'male'
                ? 'BMR = 10×体重 + 6.25×身高 - 5×年龄 + 5'
                : 'BMR = 10×体重 + 6.25×身高 - 5×年龄 - 161'}<br />
              TDEE = BMR × 活动系数
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

