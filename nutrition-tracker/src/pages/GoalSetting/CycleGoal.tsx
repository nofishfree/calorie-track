import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Input, Toast } from 'antd-mobile'
import { useGoalStore } from '../../stores'
import styles from './index.module.css'
import type { GoalTemplate } from '../../types'

interface StringDailyGoal {
  calorie_target: string
  carb_target_g: string
  protein_target_g: string
  fat_target_g: string
}

const DEFAULT_DAILY_GOAL = {
  calorie_target: '2000',
  carb_target_g: '250',
  protein_target_g: '150',
  fat_target_g: '65',
}

const validateNumberInput = (val: string, allowDecimal: boolean = true): string => {
  if (val === '' || val === null || val === undefined) return ''
  let filtered = val.replace(/[^\d.]/g, '')
  if (allowDecimal) {
    const parts = filtered.split('.')
    if (parts.length > 2) {
      filtered = parts[0] + '.' + parts.slice(1).join('')
    }
  } else {
    filtered = filtered.replace(/\./g, '')
  }
  return filtered
}

type FieldKey = 'calorie_target' | 'carb_target_g' | 'protein_target_g' | 'fat_target_g'

interface DraftKey {
  dayIndex: number
  field: FieldKey
}

const draftKeyToString = (key: DraftKey): string => `${key.dayIndex}-${key.field}`

const stringToDraftKey = (str: string): DraftKey | null => {
  const idx = str.indexOf('-')
  if (idx === -1) return null
  const dayIndex = parseInt(str.substring(0, idx))
  const field = str.substring(idx + 1) as FieldKey
  if (isNaN(dayIndex)) return null
  return { dayIndex, field }
}

export default function CycleGoalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getTemplates, updateTemplate, addTemplate } = useGoalStore()

  const [templateName, setTemplateName] = useState('')
  const [cycleDays, setCycleDays] = useState('1')
  const [cycleDaysDraft, setCycleDaysDraft] = useState('')
  const [isEditingCycleDays, setIsEditingCycleDays] = useState(false)
  const [todayIndex, setTodayIndex] = useState(0)
  const [dailyGoals, setDailyGoals] = useState<StringDailyGoal[]>([{
    calorie_target: DEFAULT_DAILY_GOAL.calorie_target,
    carb_target_g: DEFAULT_DAILY_GOAL.carb_target_g,
    protein_target_g: DEFAULT_DAILY_GOAL.protein_target_g,
    fat_target_g: DEFAULT_DAILY_GOAL.fat_target_g,
  }])

  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set())
  const [isLoaded, setIsLoaded] = useState(false)
  const [isNew, setIsNew] = useState(!id)

  useEffect(() => {
    if (!id) {
      setTemplateName('')
      setCycleDays('1')
      setTodayIndex(0)
      setDailyGoals([{
        calorie_target: DEFAULT_DAILY_GOAL.calorie_target,
        carb_target_g: DEFAULT_DAILY_GOAL.carb_target_g,
        protein_target_g: DEFAULT_DAILY_GOAL.protein_target_g,
        fat_target_g: DEFAULT_DAILY_GOAL.fat_target_g,
      }])
      setIsNew(true)
      setIsLoaded(true)
      return
    }

    const templates = getTemplates()
    const template = templates.find(t => t.id === id)
    if (!template) {
      navigate('/goal-setting')
      return
    }

    setTemplateName(template.name)
    setCycleDays(String(template.cycle_days || 1))
    setTodayIndex(template.today_index ?? 0)
    setDailyGoals((template.daily_goals || []).map(g => ({
      calorie_target: String(isNaN(Number(g.calorie_target)) ? DEFAULT_DAILY_GOAL.calorie_target : g.calorie_target),
      carb_target_g: String(isNaN(Number(g.carb_target_g)) ? DEFAULT_DAILY_GOAL.carb_target_g : g.carb_target_g),
      protein_target_g: String(isNaN(Number(g.protein_target_g)) ? DEFAULT_DAILY_GOAL.protein_target_g : g.protein_target_g),
      fat_target_g: String(isNaN(Number(g.fat_target_g)) ? DEFAULT_DAILY_GOAL.fat_target_g : g.fat_target_g),
    })))
    setIsNew(false)
    setIsLoaded(true)
  }, [id, getTemplates, navigate])

  const handleCycleDaysFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!isLoaded) return
    setIsEditingCycleDays(true)
    setCycleDaysDraft(cycleDays)
    setTimeout(() => {
      e.target.select()
    }, 0)
  }

  const handleCycleDaysChange = (val: string) => {
    if (!isLoaded || !isEditingCycleDays) return
    const filtered = validateNumberInput(val, false)
    setCycleDaysDraft(filtered)
  }

  const handleCycleDaysBlur = () => {
    if (!isLoaded) return
    setIsEditingCycleDays(false)

    if (cycleDaysDraft.trim() === '') {
      return
    }

    const days = Math.min(Math.max(parseInt(cycleDaysDraft) || 1, 1), 30)
    setCycleDays(String(days))
    setDailyGoals(prev => {
      if (prev.length < days) {
        const newGoals = [...prev]
        while (newGoals.length < days) {
          newGoals.push({
            calorie_target: DEFAULT_DAILY_GOAL.calorie_target,
            carb_target_g: DEFAULT_DAILY_GOAL.carb_target_g,
            protein_target_g: DEFAULT_DAILY_GOAL.protein_target_g,
            fat_target_g: DEFAULT_DAILY_GOAL.fat_target_g,
          })
        }
        return newGoals
      }
      if (prev.length > days) {
        return prev.slice(0, days)
      }
      return prev
    })
  }

  const handleFieldFocus = (dayIndex: number, field: FieldKey, e: React.FocusEvent<HTMLInputElement>) => {
    if (!isLoaded) return
    const key = draftKeyToString({ dayIndex, field })
    const currentValue = dailyGoals[dayIndex]?.[field] || ''
    setDraftValues(prev => ({ ...prev, [key]: String(currentValue) }))
    setEditingKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setTimeout(() => {
      e.target.select()
    }, 0)
  }

  const handleFieldChange = (dayIndex: number, field: FieldKey, val: string) => {
    if (!isLoaded) return
    const key = draftKeyToString({ dayIndex, field })
    if (!editingKeys.has(key)) return
    const filtered = validateNumberInput(val, true)
    setDraftValues(prev => ({ ...prev, [key]: filtered }))
  }

  const handleFieldBlur = (dayIndex: number, field: FieldKey) => {
    if (!isLoaded) return
    const key = draftKeyToString({ dayIndex, field })
    const draftVal = draftValues[key]

    setEditingKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })

    if (draftVal === undefined || draftVal.trim() === '') {
      return
    }

    const numVal = parseFloat(draftVal)
    if (isNaN(numVal)) {
      return
    }

    setDailyGoals(prev => {
      const newGoals = [...prev]
      if (!newGoals[dayIndex]) return prev
      newGoals[dayIndex] = {
        ...newGoals[dayIndex],
        [field]: String(numVal),
      }
      return newGoals
    })

    if (field === 'carb_target_g' || field === 'protein_target_g' || field === 'fat_target_g') {
      setTimeout(() => calculateCalories(dayIndex), 0)
    }
  }

  const getFieldDisplayValue = (dayIndex: number, field: FieldKey): string => {
    const key = draftKeyToString({ dayIndex, field })
    if (editingKeys.has(key) && draftValues[key] !== undefined) {
      return draftValues[key]
    }
    return dailyGoals[dayIndex]?.[field] || ''
  }

  const calculateCalories = (dayIndex: number) => {
    setDailyGoals(prev => {
      const newGoals = [...prev]
      const dayGoal = newGoals[dayIndex]
      if (!dayGoal) return prev
      const carb = parseFloat(dayGoal.carb_target_g) || 0
      const protein = parseFloat(dayGoal.protein_target_g) || 0
      const fat = parseFloat(dayGoal.fat_target_g) || 0
      const totalCalories = Math.round(carb * 4 + protein * 4 + fat * 9)
      newGoals[dayIndex] = { ...dayGoal, calorie_target: String(totalCalories) }
      return newGoals
    })
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    setDailyGoals(prev => {
      const newGoals = [...prev]
      const temp = newGoals[index - 1]
      newGoals[index - 1] = newGoals[index]
      newGoals[index] = temp
      return newGoals
    })
    if (todayIndex === index) {
      setTodayIndex(index - 1)
    } else if (todayIndex === index - 1) {
      setTodayIndex(index)
    }
  }

  const handleMoveDown = (index: number) => {
    const days = parseInt(cycleDays) || 1
    if (index >= days - 1) return
    setDailyGoals(prev => {
      const newGoals = [...prev]
      const temp = newGoals[index + 1]
      newGoals[index + 1] = newGoals[index]
      newGoals[index] = temp
      return newGoals
    })
    if (todayIndex === index) {
      setTodayIndex(index + 1)
    } else if (todayIndex === index + 1) {
      setTodayIndex(index)
    }
  }

  const handleSetToday = (index: number) => {
    setTodayIndex(index)
  }

  const handleSave = () => {
    if (!templateName.trim()) {
      Toast.show('请输入目标名称')
      return
    }

    const updatedGoals = [...dailyGoals]

    editingKeys.forEach(keyStr => {
      const parsed = stringToDraftKey(keyStr)
      if (!parsed) return
      const { dayIndex, field } = parsed
      const draftVal = draftValues[keyStr]
      if (draftVal === undefined || draftVal.trim() === '') return
      const numVal = parseFloat(draftVal)
      if (isNaN(numVal)) return
      if (!updatedGoals[dayIndex]) return
      updatedGoals[dayIndex] = {
        ...updatedGoals[dayIndex],
        [field]: String(numVal),
      }
    })

    updatedGoals.forEach((g, idx) => {
      if (!g) return
      const carb = parseFloat(g.carb_target_g) || 0
      const protein = parseFloat(g.protein_target_g) || 0
      const fat = parseFloat(g.fat_target_g) || 0
      updatedGoals[idx] = { ...g, calorie_target: String(Math.round(carb * 4 + protein * 4 + fat * 9)) }
    })

    setEditingKeys(new Set())
    setDraftValues({})
    setDailyGoals(updatedGoals)

    const days = Math.min(Math.max(parseInt(cycleDays) || 1, 1), 30)

    const templateData: GoalTemplate = {
      id: id || '',
      name: templateName.trim(),
      type: 'cycle',
      cycle_days: days,
      today_index: todayIndex,
      daily_goals: updatedGoals.map(g => ({
        calorie_target: isNaN(parseInt(g.calorie_target)) ? 2000 : parseInt(g.calorie_target),
        carb_target_g: isNaN(parseFloat(g.carb_target_g)) ? 200 : parseFloat(g.carb_target_g),
        protein_target_g: isNaN(parseFloat(g.protein_target_g)) ? 100 : parseFloat(g.protein_target_g),
        fat_target_g: isNaN(parseFloat(g.fat_target_g)) ? 60 : parseFloat(g.fat_target_g),
      })),
    }

    if (isNew) {
      addTemplate(templateData)
    } else {
      updateTemplate(templateData)
    }

    Toast.show('目标已保存')
    navigate('/goal-setting')
  }

  const getDayLabel = (index: number) => {
    const days = ['第1天', '第2天', '第3天', '第4天', '第5天', '第6天', '第7天',
                  '第8天', '第9天', '第10天', '第11天', '第12天', '第13天', '第14天',
                  '第15天', '第16天', '第17天', '第18天', '第19天', '第20天',
                  '第21天', '第22天', '第23天', '第24天', '第25天', '第26天',
                  '第27天', '第28天', '第29天', '第30天']
    return days[index] || `第${index + 1}天`
  }

  if (!isLoaded) {
    return null
  }

  return (
    <div className={`${styles.container} goal-setting-page`}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/goal-setting')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className={styles.title}>{isNew ? '添加周期目标' : '编辑周期目标'}</h1>
        <button className={styles.saveBtn} onClick={handleSave}>
          保存
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.formItem}>
          <label className={styles.formLabel}>目标名称</label>
          <Input
            className={styles.nameInput}
            value={templateName}
            onChange={setTemplateName}
            placeholder="请输入目标名称"
          />
        </div>

        <div className={styles.cycleDaysRow}>
          <label className={styles.cycleDaysLabel}>目标循环天数</label>
          <Input
            className={styles.cycleDaysInput}
            inputMode="numeric"
            value={isEditingCycleDays ? cycleDaysDraft : cycleDays}
            onChange={handleCycleDaysChange}
            onFocus={handleCycleDaysFocus}
            onBlur={handleCycleDaysBlur}
            placeholder="1-30天"
          />
        </div>

        {dailyGoals.map((_, index) => {
          const days = parseInt(cycleDays) || 1
          return (
            <div key={index} className={styles.dailySection}>
              <div className={styles.dailyTitleRow}>
                <h4 className={styles.dailyTitle}>{getDayLabel(index)}</h4>
                <div className={styles.dailyActions}>
                  <button
                    className={`${styles.dailyActionBtn} ${styles.todayBtn}`}
                    onClick={() => handleSetToday(index)}
                    disabled={todayIndex === index}
                  >
                    今天
                  </button>
                  <button
                    className={styles.dailyActionBtn}
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className={styles.dailyActionBtn}
                    onClick={() => handleMoveDown(index)}
                    disabled={index === days - 1}
                  >
                    ↓
                  </button>
                </div>
              </div>
              <div className={styles.formItem}>
              <label className={styles.formLabel}>热量目标 (kcal)</label>
              <Input
                inputMode="decimal"
                value={getFieldDisplayValue(index, 'calorie_target')}
                onChange={(val) => handleFieldChange(index, 'calorie_target', val)}
                onFocus={(e) => handleFieldFocus(index, 'calorie_target', e)}
                onBlur={() => handleFieldBlur(index, 'calorie_target')}
              />
            </div>
            <div className={styles.formItem}>
              <label className={styles.formLabel}>碳水目标 (g)</label>
              <Input
                inputMode="decimal"
                value={getFieldDisplayValue(index, 'carb_target_g')}
                onChange={(val) => handleFieldChange(index, 'carb_target_g', val)}
                onFocus={(e) => handleFieldFocus(index, 'carb_target_g', e)}
                onBlur={() => handleFieldBlur(index, 'carb_target_g')}
              />
            </div>
            <div className={styles.formItem}>
              <label className={styles.formLabel}>蛋白质目标 (g)</label>
              <Input
                inputMode="decimal"
                value={getFieldDisplayValue(index, 'protein_target_g')}
                onChange={(val) => handleFieldChange(index, 'protein_target_g', val)}
                onFocus={(e) => handleFieldFocus(index, 'protein_target_g', e)}
                onBlur={() => handleFieldBlur(index, 'protein_target_g')}
              />
            </div>
            <div className={styles.formItem}>
              <label className={styles.formLabel}>脂肪目标 (g)</label>
              <Input
                inputMode="decimal"
                value={getFieldDisplayValue(index, 'fat_target_g')}
                onChange={(val) => handleFieldChange(index, 'fat_target_g', val)}
                onFocus={(e) => handleFieldFocus(index, 'fat_target_g', e)}
                onBlur={() => handleFieldBlur(index, 'fat_target_g')}
              />
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
