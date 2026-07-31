import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar, Button, Toast, Selector } from 'antd-mobile'
import { useFoodStore, useAuthStore } from '../../stores'
import { generateUUID } from '../../db/db'
import styles from './Create.module.css'

interface FormField {
  name: string
  quantity: string
  unit: string
  calories: string
  caloriesUnit: 'kcal' | 'kj'
  carbs: string
  protein: string
  fat: string
}

export default function CreateFoodPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addFood, foods, markFoodAsNew } = useFoodStore()
  const { currentAccountId, isLocalAccount } = useAuthStore()

  const initialName = searchParams.get('name') || ''
  const [form, setForm] = useState<FormField>({
    name: initialName,
    quantity: '100',
    unit: 'g',
    calories: '0',
    caloriesUnit: 'kj',
    carbs: '0',
    protein: '0',
    fat: '0',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      Toast.show('请输入食物名称')
      return
    }

    const foodName = form.name.trim()
    const foodUnit = form.unit.trim() || 'g'
    const caloriesInput = parseFloat(form.calories)
    const quantity = parseFloat(form.quantity) || 100
    const carbs = parseFloat(form.carbs) || 0
    const protein = parseFloat(form.protein) || 0
    const fat = parseFloat(form.fat) || 0

    if (isNaN(caloriesInput)) {
      Toast.show('请输入有效的热量值')
      return
    }

    const userId = isLocalAccount ? 'local-account' : (currentAccountId || 'local-account')
    const existingFood = foods.find(f =>
      f.name.toLowerCase() === foodName.toLowerCase() &&
      f.unit === foodUnit &&
      (f.user_id || 'local-account') === userId
    )

    if (existingFood) {
      Toast.show('该食物已存在')
      return
    }

    setIsSubmitting(true)
    try {
      // 千焦转换为千卡：1 kcal = 4.184 kJ
      const calories = form.caloriesUnit === 'kj' ? caloriesInput / 4.184 : caloriesInput

      const foodData = {
        name: foodName,
        num: quantity,
        calorie: calories,
        calorie_unit: form.caloriesUnit,
        carbs_g: carbs,
        protein_g: protein,
        fat_g: fat,
        unit: foodUnit,
      }

      const newFoodId = generateUUID()
      addFood({
        ...foodData,
        id: newFoodId,
      })
      markFoodAsNew(newFoodId)

      Toast.show('食物添加成功')
      setTimeout(() => {
        navigate('/record')
      }, 500)
    } catch (error) {
      console.error('Failed to create food:', error)
      Toast.show(`添加失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: keyof FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleBlur = (field: keyof FormField, defaultValue: string) => {
    setForm((prev) => {
      if (prev[field].trim() === '') {
        return { ...prev, [field]: defaultValue }
      }
      return prev
    })
  }

  const validateNumberInput = (val: string): string => {
    let filtered = val.replace(/[^\d.]/g, '')
    const parts = filtered.split('.')
    if (parts.length > 2) {
      filtered = parts[0] + '.' + parts.slice(1).join('')
    }
    return filtered
  }

  return (
    <div className={styles.container}>
      <NavBar
        onBack={() => navigate('/record')}
        className={styles.navBar}
        right={
          <Button
            className={styles.navBtn}
            color="primary"
            fill="none"
            size="small"
            loading={isSubmitting}
            onClick={handleSubmit}
          >
            保存
          </Button>
        }
      >
        添加食物
      </NavBar>

      <div className={styles.formContainer}>
        <div className={styles.formItem}>
          <label className={styles.label}>食物名称</label>
          <input
            type="text"
            placeholder="请输入食物名称"
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.rowContainer}>
          <div className={styles.halfFormItem}>
            <label className={styles.label}>数量</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="100"
              value={form.quantity}
              onChange={(e) => handleChange('quantity', validateNumberInput(e.target.value))}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
              onBlur={() => handleBlur('quantity', '100')}
              className={styles.input}
            />
          </div>
          <div className={styles.halfFormItem}>
            <label className={styles.label}>单位</label>
            <input
              type="text"
              placeholder="g"
              value={form.unit}
              onChange={(e) => handleChange('unit', e.target.value)}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
              onBlur={() => handleBlur('unit', 'g')}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.calorieSection}>
          <label className={styles.label}>热量</label>
          <div className={styles.calorieInputContainer}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={form.calories}
              onChange={(e) => handleChange('calories', validateNumberInput(e.target.value))}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
              onBlur={() => handleBlur('calories', '0')}
              className={styles.input}
            />
            <div className={styles.unitDropdown}>
              <Selector
                options={[
                  { label: '千卡', value: 'kcal' },
                  { label: '千焦', value: 'kj' },
                ]}
                value={[form.caloriesUnit]}
                onChange={(arr) => {
                  if (arr.length > 0) {
                    handleChange('caloriesUnit', arr[0] as string)
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className={styles.formItem}>
          <label className={styles.label}>蛋白质（克）</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={form.protein}
            onChange={(e) => handleChange('protein', validateNumberInput(e.target.value))}
            onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
            onBlur={() => handleBlur('protein', '0')}
            className={styles.input}
          />
        </div>

        <div className={styles.formItem}>
          <label className={styles.label}>脂肪（克）</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={form.fat}
            onChange={(e) => handleChange('fat', validateNumberInput(e.target.value))}
            onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
            onBlur={() => handleBlur('fat', '0')}
            className={styles.input}
          />
        </div>

        <div className={styles.formItem}>
          <label className={styles.label}>碳水（克）</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={form.carbs}
            onChange={(e) => handleChange('carbs', validateNumberInput(e.target.value))}
            onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
            onBlur={() => handleBlur('carbs', '0')}
            className={styles.input}
          />
        </div>
      </div>
    </div>
  )
}

