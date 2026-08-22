import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { NavBar, Button, Toast, Selector } from 'antd-mobile'
import type { InputProps } from 'antd-mobile'
import { useFoodStore, useAuthStore } from '../../stores'
import type { Food } from '../../types'
import { fromKcal, toKcal } from '../../utils/nutrition'
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

const InputField = ({ label, placeholder, type = 'number', value, onChange, required = false }: {
  label: string
  placeholder: string
  type?: InputProps['type']
  value: string
  onChange: (value: string) => void
  required?: boolean
}) => (
  <div className={styles.formItem}>
    <label className={styles.label}>
      {label}
      {required && <span className={styles.required}>*</span>}
    </label>
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
      className={styles.input}
    />
  </div>
)

export default function EditFoodPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [food, setFood] = useState<Food | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const { foods, updateFood } = useFoodStore()
  const { currentAccountId, isLocalAccount } = useAuthStore()

  const [form, setForm] = useState<FormField>({
    name: '',
    quantity: '100',
    unit: 'g',
    calories: '',
    caloriesUnit: 'kj',
    carbs: '',
    protein: '',
    fat: '',
  })

  useEffect(() => {
    loadFoodDetail()
  }, [id])

  const loadFoodDetail = async () => {
    if (!id) return

    setIsLoading(true)
    try {
      const foundFood = foods.find(f => f.id === id)
      if (foundFood) {
        setFood(foundFood)
        // 如果热量单位是千焦，显示时将千卡转换回千焦
        const caloriesUnit = foundFood.calorie_unit || 'kcal'
        const displayCalories = fromKcal(foundFood.calorie, caloriesUnit)
        setForm({
          name: foundFood.name,
          quantity: String(foundFood.num),
          unit: foundFood.unit || 'g',
          calories: String(Math.round(displayCalories)),
          caloriesUnit: caloriesUnit,
          carbs: String(foundFood.carbs_g),
          protein: String(foundFood.protein_g),
          fat: String(foundFood.fat_g),
        })
      } else {
        Toast.show('食物不存在')
        navigate(-1)
      }
    } catch (error) {
      console.error('Failed to load food detail:', error)
      Toast.show('加载失败')
      navigate(-1)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!food) return

    if (!form.name.trim() || !form.calories || !form.carbs || !form.protein || !form.fat) {
      Toast.show('请填写所有必填字段')
      return
    }

    // 检查是否有重名（排除自己）
    const newName = form.name.trim()
    const newUnit = form.unit.trim() || 'g'
    const userId = isLocalAccount ? 'local-account' : (currentAccountId || 'local-account')
    const existingFood = foods.find(f =>
      f.id !== food.id &&
      f.name.toLowerCase() === newName.toLowerCase() &&
      f.unit === newUnit &&
      (f.user_id || 'local-account') === userId
    )

    if (existingFood) {
      Toast.show('该食物名称和单位已存在')
      return
    }

    setIsSubmitting(true)
    try {
      const caloriesInput = parseFloat(form.calories)
      const quantity = parseFloat(form.quantity) || 1
      const carbs = parseFloat(form.carbs)
      const protein = parseFloat(form.protein)
      const fat = parseFloat(form.fat)
      
      if (isNaN(caloriesInput) || isNaN(carbs) || isNaN(protein) || isNaN(fat)) {
        Toast.show('请输入有效的数字')
        setIsSubmitting(false)
        return
      }

      const calories = toKcal(caloriesInput, form.caloriesUnit)

      const updatedFood: Food = {
        ...food,
        name: newName,
        num: quantity,
        calorie: calories,
        calorie_unit: form.caloriesUnit,
        carbs_g: carbs,
        protein_g: protein,
        fat_g: fat,
        unit: newUnit,
      }

      // 先更新本地数据
      updateFood(updatedFood.id, updatedFood)

      Toast.show('保存成功')
      navigate(-1)
    } catch (error) {
      console.error('Failed to update food:', error)
      Toast.show('保存失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (field: keyof FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <NavBar onBack={() => navigate(-1)} className={styles.navBar}>
          编辑食物
        </NavBar>
        <div className={styles.formContainer}>
          <div className={styles.loading}>加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <NavBar
        onBack={() => navigate(-1)}
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
        编辑食物
      </NavBar>

      <div className={styles.formContainer}>
        <InputField
          label="食物名称"
          placeholder="请输入食物名称"
          type="text"
          value={form.name}
          onChange={(v) => handleChange('name', v)}
          required
        />

        <div className={styles.rowContainer}>
          <div className={styles.halfFormItem}>
            <label className={styles.label}>数量 <span className={styles.required}>*</span></label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="100"
              value={form.quantity}
              onChange={(e) => handleChange('quantity', e.target.value)}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
              className={styles.input}
            />
          </div>
          <div className={styles.halfFormItem}>
            <label className={styles.label}>单位 <span className={styles.required}>*</span></label>
            <input
              type="text"
              placeholder="g"
              value={form.unit}
              onChange={(e) => handleChange('unit', e.target.value)}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.calorieSection}>
          <label className={styles.label}>热量 <span className={styles.required}>*</span></label>
          <div className={styles.calorieInputContainer}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={form.calories}
              onChange={(e) => handleChange('calories', e.target.value)}
              onFocus={(e) => { const t = e.target; setTimeout(() => t.select(), 0) }}
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

        <InputField
          label="蛋白质（克）"
          placeholder="0"
          value={form.protein}
          onChange={(v) => handleChange('protein', v)}
          required
        />

        <InputField
          label="脂肪（克）"
          placeholder="0"
          value={form.fat}
          onChange={(v) => handleChange('fat', v)}
          required
        />

        <InputField
          label="碳水（克）"
          placeholder="0"
          value={form.carbs}
          onChange={(v) => handleChange('carbs', v)}
          required
        />
      </div>
    </div>
  )
}
