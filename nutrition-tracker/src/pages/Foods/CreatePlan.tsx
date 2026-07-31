import { useState, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar, Button, Toast, SearchBar, Input, Popup } from 'antd-mobile'
import { useFoodStore, usePlanStore, useAuthStore } from '../../stores'
import type { Food } from '../../types'
import styles from './CreatePlan.module.css'

interface SelectedFood {
  food: Food
  quantity: number
}

interface SelectedFoodStr {
  food: Food
  quantityStr: string
}

export default function CreatePlanPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialPlanName = searchParams.get('name') || ''
  const [planName, setPlanName] = useState(initialPlanName)
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([])
  const [selectedFoodStrs, setSelectedFoodStrs] = useState<SelectedFoodStr[]>([])
  const [showFoodSelector, setShowFoodSelector] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const quantityDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const prevQuantityRef = useRef<Record<string, string>>({})

  const { foods } = useFoodStore()
  const { addLocalPlan, localPlans, markPlanAsNew } = usePlanStore()
  const { currentAccountId } = useAuthStore()

  const filteredFoods = useMemo(() => {
    if (!foods || !keyword.trim()) return foods || []
    return (foods || []).filter((food) =>
      food.name.toLowerCase().includes(keyword.toLowerCase())
    )
  }, [keyword, foods])

  const totals = useMemo(() => {
    let calories = 0
    let protein = 0
    let fat = 0
    let carbs = 0

    selectedFoods.forEach(({ food, quantity }) => {
      const ratio = quantity / food.num
      calories += food.calorie * ratio
      protein += food.protein_g * ratio
      fat += food.fat_g * ratio
      carbs += food.carbs_g * ratio
    })

    return {
      calories: Math.round(calories * 100) / 100,
      protein: Math.round(protein * 100) / 100,
      fat: Math.round(fat * 100) / 100,
      carbs: Math.round(carbs * 100) / 100,
    }
  }, [selectedFoods])

  const handleAddFood = (food: Food) => {
    const exists = selectedFoods.find((item) => item.food.id === food.id)
    if (exists) {
      Toast.show('该食物已在套餐中')
      return
    }
    const quantity = food.num
    setSelectedFoods([...selectedFoods, { food, quantity }])
    setSelectedFoodStrs([...selectedFoodStrs, { food, quantityStr: String(quantity) }])
    setShowFoodSelector(false)
    setKeyword('')
    Toast.show('已添加')
  }

  const handleRemoveFood = (foodId: string) => {
    setSelectedFoods(selectedFoods.filter((item) => item.food.id !== foodId))
    setSelectedFoodStrs(selectedFoodStrs.filter((item) => item.food.id !== foodId))
  }

  const handleSubmit = async () => {
    if (!planName.trim()) {
      Toast.show('请输入套餐名称')
      return
    }
    if (selectedFoods.length === 0) {
      Toast.show('请至少添加一个食物')
      return
    }

    // 检查是否有重名套餐
    const newPlanName = planName.trim()
    const userId = currentAccountId || 'local-account'
    const existingPlan = localPlans.find(p =>
      p.name.toLowerCase() === newPlanName.toLowerCase() &&
      (p.user_id || 'local-account') === userId
    )

    if (existingPlan) {
      Toast.show('该套餐名称已存在')
      return
    }

    setIsSubmitting(true)
    try {
      const items = selectedFoods.map((item) => ({
        food_id: item.food.id,
        food: item.food,
        quantity: item.quantity,
      }))

      const newPlan = addLocalPlan(newPlanName, items, currentAccountId || 'local-account')
      markPlanAsNew(newPlan.id)

      Toast.show('套餐创建成功')
      setTimeout(() => {
        navigate('/record?tab=plan')
      }, 500)
    } catch (error) {
      console.error('Failed to create plan:', error)
      Toast.show(`创建失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.container}>
      <NavBar
        onBack={() => navigate('/record?tab=plan')}
        className={styles.navBar}
        right={
          <Button
            className={styles.navBtn}
            color="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            保存
          </Button>
        }
      >
        新建套餐
      </NavBar>

      <div className={styles.formContainer}>
        <div className={styles.formItem}>
          <label className={styles.label}>
            套餐名称<span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            className={styles.input}
            placeholder="例如：增肌午餐"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
          />
        </div>

        <div className={styles.formItem}>
          <div className={styles.label}>添加食物</div>
          <Button
            block
            color="primary"
            fill="outline"
            onClick={() => setShowFoodSelector(true)}
          >
            + 添加食物
          </Button>
        </div>

        {selectedFoods.length > 0 && (
          <div className={styles.selectedList}>
            <div className={styles.label}>已选食物</div>
            {selectedFoods.map((item, index) => (
              <div key={item.food.id} className={styles.selectedItem}>
                <div className={styles.selectedInfo}>
                  <span className={styles.selectedName}>{item.food.name}</span>
                  <span className={styles.selectedBase}>
                    {item.food.num}{item.food.unit} = {item.food.calorie.toFixed(2)} kcal
                  </span>
                </div>
                <div className={styles.selectedActions}>
                  <Input
                    inputMode="decimal"
                    value={selectedFoodStrs[index]?.quantityStr ?? String(item.quantity)}
                    onFocus={(e) => {
                      const currentVal = selectedFoodStrs[index]?.quantityStr ?? String(item.quantity)
                      prevQuantityRef.current[item.food.id] = currentVal
                      setTimeout(() => {
                        e.target.select()
                      }, 0)
                    }}
                    onChange={(val) => {
                      const foodId = item.food.id
                      let filtered = val.replace(/[^\d.]/g, '')
                      const parts = filtered.split('.')
                      if (parts.length > 2) {
                        filtered = parts[0] + '.' + parts.slice(1).join('')
                      }
                      setSelectedFoodStrs(prev => {
                        const newStrs = [...prev]
                        newStrs[index] = { food: item.food, quantityStr: filtered }
                        return newStrs
                      })
                      if (quantityDebounceRef.current[foodId]) {
                        clearTimeout(quantityDebounceRef.current[foodId])
                      }
                      if (filtered === '' || filtered === '.') {
                        return
                      }
                      quantityDebounceRef.current[foodId] = setTimeout(() => {
                        const num = parseFloat(filtered)
                        if (!isNaN(num) && num > 0) {
                          setSelectedFoods(prev =>
                            prev.map(f =>
                              f.food.id === foodId
                                ? { ...f, quantity: num }
                                : f
                            )
                          )
                        }
                      }, 300)
                    }}
                    onBlur={() => {
                      const foodId = item.food.id
                      if (quantityDebounceRef.current[foodId]) {
                        clearTimeout(quantityDebounceRef.current[foodId])
                      }
                      const currentStr = selectedFoodStrs[index]?.quantityStr
                      if (currentStr === '' || currentStr === '.') {
                        const prevVal = prevQuantityRef.current[foodId] || String(item.food.num)
                        setSelectedFoodStrs(prev => {
                          const newStrs = [...prev]
                          newStrs[index] = { food: item.food, quantityStr: prevVal }
                          return newStrs
                        })
                      }
                    }}
                    style={{ width: '60px', textAlign: 'center' }}
                  />
                  <span>{item.food.unit}</span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveFood(item.food.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.nutritionSummary}>
          <div className={styles.summaryTitle}>营养成分总计</div>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>热量</span>
              <span className={styles.summaryValue}>{totals.calories.toFixed(2)} kcal</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>蛋白质</span>
              <span className={styles.summaryValue}>{totals.protein.toFixed(2)} g</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>碳水</span>
              <span className={styles.summaryValue}>{totals.carbs.toFixed(2)} g</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>脂肪</span>
              <span className={styles.summaryValue}>{totals.fat.toFixed(2)} g</span>
            </div>
          </div>
        </div>
      </div>

      <Popup
        visible={showFoodSelector}
        onMaskClick={() => setShowFoodSelector(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 0,
          height: '70vh',
        }}
      >
        <div className={styles.selectorContainer}>
          <div className={styles.selectorHeader}>
            <h3 className={styles.selectorTitle}>选择食物</h3>
          </div>
          <div className={styles.selectorSearch}>
            <SearchBar
              placeholder="搜索食物"
              value={keyword}
              onChange={setKeyword}
            />
          </div>
          <div className={styles.selectorList}>
            {filteredFoods.length === 0 ? (
              <div className={styles.selectorEmpty}>暂无食物数据</div>
            ) : (
              filteredFoods.map((food) => (
                <div
                  key={food.id}
                  className={styles.selectorItem}
                  onClick={() => handleAddFood(food)}
                >
                  <div className={styles.selectorInfo}>
                    <span className={styles.selectorName}>{food.name}</span>
                    <span className={styles.selectorCal}>
                      {food.calorie.toFixed(2)} kcal / {food.num} {food.unit}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Popup>
    </div>
  )
}

