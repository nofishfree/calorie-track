import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Input, Toast } from 'antd-mobile'
import { useGoalStore } from '../../stores'
import styles from './index.module.css'
import type { GoalTemplate, DailyGoal } from '../../types'

const DEFAULT_VALUES = {
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
  field: FieldKey
}

const draftKeyToString = (key: DraftKey): string => key.field

const stringToDraftKey = (str: string): DraftKey | null => {
  const validKeys: FieldKey[] = ['calorie_target', 'carb_target_g', 'protein_target_g', 'fat_target_g']
  if (validKeys.includes(str as FieldKey)) {
    return { field: str as FieldKey }
  }
  return null
}

export default function DailyGoalPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getTemplates, updateTemplate, addTemplate } = useGoalStore()

  const [templateName, setTemplateName] = useState('')
  const [values, setValues] = useState({
    calorie_target: DEFAULT_VALUES.calorie_target,
    carb_target_g: DEFAULT_VALUES.carb_target_g,
    protein_target_g: DEFAULT_VALUES.protein_target_g,
    fat_target_g: DEFAULT_VALUES.fat_target_g,
  })

  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [editingKeys, setEditingKeys] = useState<Set<string>>(new Set())
  const [isLoaded, setIsLoaded] = useState(false)
  const [isNew, setIsNew] = useState(!id)

  useEffect(() => {
    if (!id) {
      setTemplateName('')
      setValues({
        calorie_target: DEFAULT_VALUES.calorie_target,
        carb_target_g: DEFAULT_VALUES.carb_target_g,
        protein_target_g: DEFAULT_VALUES.protein_target_g,
        fat_target_g: DEFAULT_VALUES.fat_target_g,
      })
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

    const goal = (template.daily_goals || [])[0] as DailyGoal | undefined || {
          calorie_target: DEFAULT_VALUES.calorie_target,
          carb_target_g: DEFAULT_VALUES.carb_target_g,
          protein_target_g: DEFAULT_VALUES.protein_target_g,
          fat_target_g: DEFAULT_VALUES.fat_target_g,
        }
    setTemplateName(template.name)
    setValues({
      calorie_target: String(goal.calorie_target || DEFAULT_VALUES.calorie_target),
      carb_target_g: String(goal.carb_target_g || DEFAULT_VALUES.carb_target_g),
      protein_target_g: String(goal.protein_target_g || DEFAULT_VALUES.protein_target_g),
      fat_target_g: String(goal.fat_target_g || DEFAULT_VALUES.fat_target_g),
    })
    setIsNew(false)
    setIsLoaded(true)
  }, [id, getTemplates, navigate])

  const handleFieldFocus = (field: FieldKey, e: React.FocusEvent<HTMLInputElement>) => {
    if (!isLoaded) return
    const key = draftKeyToString({ field })
    const currentValue = values[field] || ''
    setDraftValues(prev => ({ ...prev, [key]: currentValue }))
    setEditingKeys(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setTimeout(() => {
      e.target.select()
    }, 0)
  }

  const handleFieldChange = (field: FieldKey, val: string) => {
    if (!isLoaded) return
    const key = draftKeyToString({ field })
    if (!editingKeys.has(key)) return
    const filtered = validateNumberInput(val, true)
    setDraftValues(prev => ({ ...prev, [key]: filtered }))
  }

  const handleFieldBlur = (field: FieldKey) => {
    if (!isLoaded) return
    const key = draftKeyToString({ field })
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

    setValues(prev => ({
      ...prev,
      [field]: String(numVal),
    }))

    if (field === 'carb_target_g' || field === 'protein_target_g' || field === 'fat_target_g') {
      setTimeout(() => calculateCalories(), 0)
    }
  }

  const getFieldDisplayValue = (field: FieldKey): string => {
    const key = draftKeyToString({ field })
    if (editingKeys.has(key) && draftValues[key] !== undefined) {
      return draftValues[key]
    }
    return values[field] || ''
  }

  const calculateCalories = () => {
    const carb = parseFloat(values.carb_target_g) || 0
    const protein = parseFloat(values.protein_target_g) || 0
    const fat = parseFloat(values.fat_target_g) || 0
    const totalCalories = Math.round(carb * 4 + protein * 4 + fat * 9)
    setValues(prev => ({ ...prev, calorie_target: String(totalCalories) }))
  }

  const handleSave = () => {
    if (!templateName.trim()) {
      Toast.show('请输入目标名称')
      return
    }

    const updatedValues = { ...values }

    editingKeys.forEach(keyStr => {
      const parsed = stringToDraftKey(keyStr)
      if (!parsed) return
      const { field } = parsed
      const draftVal = draftValues[keyStr]
      if (draftVal === undefined || draftVal.trim() === '') return
      const numVal = parseFloat(draftVal)
      if (isNaN(numVal)) return
      updatedValues[field] = String(numVal)
    })

    const carb = parseFloat(updatedValues.carb_target_g) || 0
    const protein = parseFloat(updatedValues.protein_target_g) || 0
    const fat = parseFloat(updatedValues.fat_target_g) || 0
    updatedValues.calorie_target = String(Math.round(carb * 4 + protein * 4 + fat * 9))

    setEditingKeys(new Set())
    setDraftValues({})
    setValues(updatedValues)

    const templateData: GoalTemplate = {
      id: id || '',
      name: templateName.trim(),
      type: 'daily',
      cycle_days: 1,
      today_index: 0,
      daily_goals: [{
        calorie_target: isNaN(parseInt(updatedValues.calorie_target)) ? 2000 : parseInt(updatedValues.calorie_target),
        carb_target_g: isNaN(parseFloat(updatedValues.carb_target_g)) ? 250 : parseFloat(updatedValues.carb_target_g),
        protein_target_g: isNaN(parseFloat(updatedValues.protein_target_g)) ? 150 : parseFloat(updatedValues.protein_target_g),
        fat_target_g: isNaN(parseFloat(updatedValues.fat_target_g)) ? 65 : parseFloat(updatedValues.fat_target_g),
      }],
    }

    if (isNew) {
      addTemplate(templateData)
    } else {
      updateTemplate(templateData)
    }

    Toast.show('目标已保存')
    navigate('/goal-setting')
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
        <h1 className={styles.title}>{isNew ? '添加每日目标' : '编辑每日目标'}</h1>
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

        <div className={styles.formItem}>
          <label className={styles.formLabel}>热量目标 (kcal)</label>
          <Input
            inputMode="decimal"
            value={getFieldDisplayValue('calorie_target')}
            onChange={(val) => handleFieldChange('calorie_target', val)}
            onFocus={(e) => handleFieldFocus('calorie_target', e)}
            onBlur={() => handleFieldBlur('calorie_target')}
          />
        </div>

        <div className={styles.formItem}>
          <label className={styles.formLabel}>碳水目标 (g)</label>
          <Input
            inputMode="decimal"
            value={getFieldDisplayValue('carb_target_g')}
            onChange={(val) => handleFieldChange('carb_target_g', val)}
            onFocus={(e) => handleFieldFocus('carb_target_g', e)}
            onBlur={() => handleFieldBlur('carb_target_g')}
          />
        </div>

        <div className={styles.formItem}>
          <label className={styles.formLabel}>蛋白质目标 (g)</label>
          <Input
            inputMode="decimal"
            value={getFieldDisplayValue('protein_target_g')}
            onChange={(val) => handleFieldChange('protein_target_g', val)}
            onFocus={(e) => handleFieldFocus('protein_target_g', e)}
            onBlur={() => handleFieldBlur('protein_target_g')}
          />
        </div>

        <div className={styles.formItem}>
          <label className={styles.formLabel}>脂肪目标 (g)</label>
          <Input
            inputMode="decimal"
            value={getFieldDisplayValue('fat_target_g')}
            onChange={(val) => handleFieldChange('fat_target_g', val)}
            onFocus={(e) => handleFieldFocus('fat_target_g', e)}
            onBlur={() => handleFieldBlur('fat_target_g')}
          />
        </div>
      </div>
    </div>
  )
}
