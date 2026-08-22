import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Dialog, Button, Popup, Input, Selector, Toast } from 'antd-mobile'
import { CalorieRing, NutrientCards, RecordCard, AvatarDisplay } from '../../components'
import { useGoalStore, useAuthStore, useRecordStore, useFoodStore, usePlanStore, useUIStore } from '../../stores'
import { getToday } from '../../utils/helpers'
import {
  fromKcal,
  nutrientOrZero,
  parseNutrientInput,
  sanitizeNumberInput,
  scaleFoodNutrition,
  sumFoodPortions,
  sumRecordNutrition,
  toKcal,
} from '../../utils/nutrition'
import { generateUUID } from '../../db/db'
import dayjs from 'dayjs'
import styles from './index.module.css'

export default function HomePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')
  const [selectedDate, setSelectedDate] = useState(dateParam || getToday())
  const dateInputRef = useRef<HTMLInputElement>(null)
  const goalStore = useGoalStore()
  const goal = goalStore.getGoalForDate(selectedDate)
  const { currentAccountId, user } = useAuthStore()
  const { records, getRecordsByDate, deleteRecord: deleteRecordFromStore } = useRecordStore()
  const { clearNewFoods } = useFoodStore()
  const { clearNewPlans } = usePlanStore()

  const [showEditPopup, setShowEditPopup] = useState(false)
  const [showQuickAddPopup, setShowQuickAddPopup] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [editServingCount, setEditServingCount] = useState(0)
  const [editServingCountStr, setEditServingCountStr] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editPlanItems, setEditPlanItems] = useState<Array<{ food_id: string; food: any; quantity: number; quantityStr: string }>>([])
  const servingCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const servingCountPrevRef = useRef<string>('')

  const [editQuickAddName, setEditQuickAddName] = useState('')
  const [editQuickAddCalories, setEditQuickAddCalories] = useState<string>('')
  const [editQuickAddProtein, setEditQuickAddProtein] = useState<string>('')
  const [editQuickAddFat, setEditQuickAddFat] = useState<string>('')
  const [editQuickAddCarbs, setEditQuickAddCarbs] = useState<string>('')
  const [editQuickAddCaloriesUnit, setEditQuickAddCaloriesUnit] = useState<'kcal' | 'kj'>('kj')

  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddCalories, setQuickAddCalories] = useState<string>('')
  const [quickAddProtein, setQuickAddProtein] = useState<string>('')
  const [quickAddFat, setQuickAddFat] = useState<string>('')
  const [quickAddCarbs, setQuickAddCarbs] = useState<string>('')
  const [quickAddTime, setQuickAddTime] = useState(dayjs().format('HH:mm'))
  const [quickAddCaloriesUnit, setQuickAddCaloriesUnit] = useState<'kcal' | 'kj'>('kj')
  const setShowProfileDrawer = useUIStore(state => state.setShowProfileDrawer)

  const todayRecords = useMemo(() => {
    return getRecordsByDate(selectedDate, currentAccountId)
  }, [records, selectedDate, currentAccountId, getRecordsByDate])

  useEffect(() => {
    if (dateParam) {
      setSelectedDate(dateParam)
    }
  }, [dateParam])

  useEffect(() => {
    clearNewFoods()
    clearNewPlans()
  }, [clearNewFoods, clearNewPlans])

  useEffect(() => {
    setSearchParams({ date: selectedDate }, { replace: true })
  }, [selectedDate, setSearchParams])

  useEffect(() => {
    goalStore.checkAndUpdateDate()
  }, [goalStore, selectedDate])

  const handleQuickAddNumberChange = (setter: (val: string) => void, value: string) => {
    setter(sanitizeNumberInput(value))
  }

  const handleQuickAddNumberBlur = (setter: (val: string) => void, value: string) => {
    if (value === '' || value === '.') {
      setter('')
      return
    }
    const num = parseFloat(value)
    if (!isNaN(num)) {
      setter(String(Math.round(num * 10) / 10))
    }
  }

  const handleQuickAddConfirm = () => {
    const record_time = dayjs(`${selectedDate}T${quickAddTime}:00`).toISOString()
    const { addRecord } = useRecordStore.getState()

    const caloriesKcal = toKcal(parseNutrientInput(quickAddCalories), quickAddCaloriesUnit)
    const carbs = parseNutrientInput(quickAddCarbs)
    const protein = parseNutrientInput(quickAddProtein)
    const fat = parseNutrientInput(quickAddFat)

    addRecord({
      food: {
        id: generateUUID(),
        name: quickAddName.trim(),
        num: 100,
        calorie: nutrientOrZero(caloriesKcal),
        calorie_unit: quickAddCaloriesUnit,
        carbs_g: nutrientOrZero(carbs),
        protein_g: nutrientOrZero(protein),
        fat_g: nutrientOrZero(fat),
        unit: 'g',
      },
      serving_count: 1,
      record_time,
      calories_total: caloriesKcal,
      protein_total: protein,
      fat_total: fat,
      carbs_total: carbs,
      is_quick_add: true,
    })

    setShowQuickAddPopup(false)
    setQuickAddName('')
    setQuickAddCalories('')
    setQuickAddProtein('')
    setQuickAddFat('')
    setQuickAddCarbs('')
    setQuickAddTime(dayjs().format('HH:mm'))
    setQuickAddCaloriesUnit('kj')
  }

  const handlePrevDay = () => {
    setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'))
  }

  const handleNextDay = () => {
    setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'))
  }

  const handleDateClick = () => {
    dateInputRef.current?.showPicker()
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value) {
      setSelectedDate(value)
    }
  }

  const handleDeleteRecord = async (recordId: string) => {
    const result = await Dialog.confirm({
      content: '确定删除这条记录吗？',
    })
    if (result) {
      try {
        deleteRecordFromStore(recordId)
      } catch (error) {
        console.error('Failed to delete record:', error)
        Toast.show('删除失败')
      }
    }
  }

  const handlePlanItemQuantityChange = (foodId: string, value: string) => {
    const filtered = sanitizeNumberInput(value)
    setEditPlanItems(prev => prev.map(item => {
      if (item.food_id !== foodId) return item
      const num = parseFloat(filtered)
      if (!isNaN(num) && num > 0) {
        return { ...item, quantityStr: filtered, quantity: num }
      }
      return { ...item, quantityStr: filtered }
    }))
  }

  const handlePlanItemQuantityBlur = (foodId: string, prevVal: string) => {
    setEditPlanItems(prev => prev.map(item => {
      if (item.food_id !== foodId) return item
      if (item.quantityStr === '' || item.quantityStr === '.') {
        const num = parseFloat(prevVal)
        return { ...item, quantityStr: prevVal, quantity: isNaN(num) ? item.quantity : num }
      }
      return item
    }))
  }

  const handleEditRecord = (record: any) => {
    setEditingRecord(record)
    const time = dayjs(record.record_time).format('HH:mm')
    setEditTime(time)

    if (record.is_quick_add) {
      setEditQuickAddName(record.food.name)
      const unit = (record.food.calorie_unit as 'kcal' | 'kj') || 'kj'
      setEditQuickAddCaloriesUnit(unit)
      // calories_total 存储的是 kcal，编辑时按原始单位换算回显示值
      const caloriesDisplay = record.calories_total >= 0
        ? fromKcal(record.calories_total, unit, 1)
        : -1
      setEditQuickAddCalories(caloriesDisplay >= 0 ? String(caloriesDisplay) : '')
      setEditQuickAddProtein(record.protein_total >= 0 ? String(record.protein_total) : '')
      setEditQuickAddFat(record.fat_total >= 0 ? String(record.fat_total) : '')
      setEditQuickAddCarbs(record.carbs_total >= 0 ? String(record.carbs_total) : '')
      setEditPlanItems([])
    } else if (record.plan_id && record.plan_items) {
      const items = record.plan_items.map((item: any) => ({
        ...item,
        quantityStr: String(item.quantity),
      }))
      setEditPlanItems(items)
    } else {
      const currentServing = record.serving_count * record.food.num
      setEditServingCount(currentServing)
      setEditServingCountStr(String(currentServing))
      setEditPlanItems([])
    }

    setShowEditPopup(true)
  }

  const handleEditConfirm = async () => {
    if (!editingRecord) return

    try {
      const recordDate = dayjs(editingRecord.record_time).format('YYYY-MM-DD')
      const record_time = dayjs(`${recordDate}T${editTime}:00`).toISOString()

      const { updateRecord: updateRecordInStore } = useRecordStore.getState()

      if (editingRecord.is_quick_add) {
        const editCaloriesKcal = toKcal(parseNutrientInput(editQuickAddCalories), editQuickAddCaloriesUnit)
        const editCarbs = parseNutrientInput(editQuickAddCarbs)
        const editProtein = parseNutrientInput(editQuickAddProtein)
        const editFat = parseNutrientInput(editQuickAddFat)

        updateRecordInStore(editingRecord.id, {
          record_time,
          food: {
            ...editingRecord.food,
            name: editQuickAddName.trim(),
            calorie: nutrientOrZero(editCaloriesKcal),
            calorie_unit: editQuickAddCaloriesUnit,
            carbs_g: nutrientOrZero(editCarbs),
            protein_g: nutrientOrZero(editProtein),
            fat_g: nutrientOrZero(editFat),
          },
          calories_total: editCaloriesKcal,
          protein_total: editProtein,
          fat_total: editFat,
          carbs_total: editCarbs,
        })
      } else if (editingRecord.plan_id && editPlanItems.length > 0) {
        const totals = sumFoodPortions(editPlanItems)

        updateRecordInStore(editingRecord.id, {
          record_time,
          calories_total: totals.calories,
          protein_total: totals.protein,
          fat_total: totals.fat,
          carbs_total: totals.carbs,
          food: {
            ...editingRecord.food,
            calorie: totals.calories,
            calorie_unit: editingRecord.food.calorie_unit || 'kj',
            protein_g: totals.protein,
            carbs_g: totals.carbs,
            fat_g: totals.fat,
          },
          plan_items: editPlanItems.map(item => ({
            food_id: item.food_id,
            food: item.food,
            quantity: item.quantity,
          })),
        })
      } else {
        const food = editingRecord.food
        const newServingRatio = editServingCount / food.num
        const totals = scaleFoodNutrition(food, editServingCount)

        updateRecordInStore(editingRecord.id, {
          record_time,
          serving_count: newServingRatio,
          calories_total: totals.calories,
          protein_total: totals.protein,
          fat_total: totals.fat,
          carbs_total: totals.carbs,
        })
      }

      setShowEditPopup(false)
      setEditingRecord(null)
    } catch (error) {
      console.error('Failed to update record:', error)
      Toast.show('保存失败')
    }
  }

  const nutrition = useMemo(() => sumRecordNutrition(todayRecords), [todayRecords])

  const editPlanNutrition = useMemo(() => sumFoodPortions(editPlanItems), [editPlanItems])

  const dateText = useMemo(() => {
    const d = dayjs(selectedDate)
    const today = getToday()
    if (selectedDate === today) return '今天'
    return d.format('MM月DD日 dddd')
  }, [selectedDate])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.avatar} onClick={() => setShowProfileDrawer(true)}>
          <AvatarDisplay hash={user?.avatar} size={48} />
        </button>
        <button className={styles.dateBtn} onClick={handlePrevDay}>
          ‹
        </button>
        <div className={styles.dateInfo} onClick={handleDateClick}>
          <span className={styles.dateText}>{dateText}</span>
          <span className={styles.dateFull}>{selectedDate}</span>
        </div>
        <button className={styles.dateBtn} onClick={handleNextDay}>
          ›
        </button>
      </header>

      <section className={styles.dashboard}>
        <CalorieRing current={nutrition.calories} target={goal.calorie_target} />
        <NutrientCards 
          nutrition={{
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
          }} 
          goal={{
            calories: goal.calorie_target,
            protein: goal.protein_target_g,
            carbs: goal.carb_target_g,
            fat: goal.fat_target_g,
          }} 
        />
      </section>

      <section className={styles.records}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>今日记录</h3>
        </div>
        {todayRecords.length === 0 ? (
          <div className={styles.empty}>
            <p>暂无记录</p>
            <p className={styles.hint}>点击下方按钮添加记录</p>
          </div>
        ) : (
          <div className={styles.recordList}>
            {todayRecords.map((record) => {
              const isPlan = !!record.plan_id
              const servingText = isPlan 
                ? '1 份' 
                : `${(record.serving_count * record.food.num).toFixed(0)} ${record.food.unit || 'g'}`
              return (
                <RecordCard
                  key={record.id}
                  record={record}
                  servingText={servingText}
                  onEdit={() => handleEditRecord(record)}
                  onDelete={() => handleDeleteRecord(record.id)}
                />
              )
            })}
          </div>
        )}
      </section>

      <button
        className={styles.quickAddFloatingButton}
        onClick={() => setShowQuickAddPopup(true)}
      >
        +
      </button>

      <button
        className={styles.addButton}
        onClick={() => navigate(`/record?date=${selectedDate}`)}
      >
        +
      </button>

      {showEditPopup && editingRecord && (
        <Popup
          visible={showEditPopup}
          onMaskClick={() => setShowEditPopup(false)}
          bodyStyle={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
          }}
        >
          <div className={styles.editPopup}>
            {editingRecord.is_quick_add ? (
              <>
                <div className={styles.editPopupHeader}>
                  <Input
                    value={editQuickAddName}
                    onChange={setEditQuickAddName}
                    placeholder="食物名称"
                    className={styles.editFoodName}
                  />
                </div>

                <div className={styles.timeSelector}>
                  <label className={styles.timeLabel}>时间</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className={styles.timeInput}
                  />
                </div>

                <div className={styles.preview}>
                  <div className={styles.previewItem}>
                    <span>热量</span>
                    <div className={styles.previewInputWrapper}>
                      <Input
                        inputMode="decimal"
                        value={editQuickAddCalories}
                        onChange={(val) => handleQuickAddNumberChange(setEditQuickAddCalories, val)}
                        onBlur={() => handleQuickAddNumberBlur(setEditQuickAddCalories, editQuickAddCalories)}
                        placeholder={editQuickAddCalories === '' ? '未知' : ''}
                        style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                      />
                      <Selector
                        options={[
                          { label: '千卡', value: 'kcal' },
                          { label: '千焦', value: 'kj' },
                        ]}
                        value={[editQuickAddCaloriesUnit]}
                        onChange={(arr) => {
                          if (arr.length > 0) {
                            setEditQuickAddCaloriesUnit(arr[0] as 'kcal' | 'kj')
                          }
                        }}
                        style={{ '--border-radius': '4px', '--padding': '2px 6px', fontSize: '11px' } as React.CSSProperties}
                      />
                    </div>
                  </div>
                  <div className={styles.previewItem}>
                    <span>蛋白质</span>
                    <div className={styles.previewInputWrapper}>
                      <Input
                        inputMode="decimal"
                        value={editQuickAddProtein}
                        onChange={(val) => handleQuickAddNumberChange(setEditQuickAddProtein, val)}
                        onBlur={() => handleQuickAddNumberBlur(setEditQuickAddProtein, editQuickAddProtein)}
                        placeholder={editQuickAddProtein === '' ? '未知' : ''}
                        style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                      />
                      <span className={styles.previewUnit}>g</span>
                    </div>
                  </div>
                  <div className={styles.previewItem}>
                    <span>碳水</span>
                    <div className={styles.previewInputWrapper}>
                      <Input
                        inputMode="decimal"
                        value={editQuickAddCarbs}
                        onChange={(val) => handleQuickAddNumberChange(setEditQuickAddCarbs, val)}
                        onBlur={() => handleQuickAddNumberBlur(setEditQuickAddCarbs, editQuickAddCarbs)}
                        placeholder={editQuickAddCarbs === '' ? '未知' : ''}
                        style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                      />
                      <span className={styles.previewUnit}>g</span>
                    </div>
                  </div>
                  <div className={styles.previewItem}>
                    <span>脂肪</span>
                    <div className={styles.previewInputWrapper}>
                      <Input
                        inputMode="decimal"
                        value={editQuickAddFat}
                        onChange={(val) => handleQuickAddNumberChange(setEditQuickAddFat, val)}
                        onBlur={() => handleQuickAddNumberBlur(setEditQuickAddFat, editQuickAddFat)}
                        placeholder={editQuickAddFat === '' ? '未知' : ''}
                        style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                      />
                      <span className={styles.previewUnit}>g</span>
                    </div>
                  </div>
                </div>

                <Button block color="danger" size="large" onClick={handleEditConfirm}>
                  保存
                </Button>
              </>
            ) : (
              <>
                <div className={styles.editPopupHeader}>
                  <h3 className={styles.editPopupTitle}>{editingRecord.food.name}</h3>
                </div>

                <div className={styles.timeSelector}>
                  <label className={styles.timeLabel}>时间</label>
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className={styles.timeInput}
                  />
                </div>

                {editingRecord.plan_id && editPlanItems.length > 0 ? (
                  <>
                    <div className={styles.planItemsList}>
                      <div className={styles.planItemsTitle}>套餐内容</div>
                      {editPlanItems.map((item) => (
                        <div key={item.food_id} className={styles.planItemRow}>
                          <span className={styles.planItemName}>{item.food.name}</span>
                          <div className={styles.planItemQuantity}>
                            <Input
                              inputMode="decimal"
                              value={item.quantityStr}
                              onFocus={(e) => {
                                setTimeout(() => {
                                  e.target.select()
                                }, 0)
                              }}
                              onChange={(val) => handlePlanItemQuantityChange(item.food_id, val)}
                              onBlur={() => handlePlanItemQuantityBlur(item.food_id, String(item.quantity))}
                              style={{ width: '80px', textAlign: 'right' }}
                            />
                            <span style={{ marginLeft: 8 }}>{item.food.unit || 'g'}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className={styles.preview}>
                      <div className={styles.previewItem}>
                        <span>热量</span>
                        <strong>{String(parseFloat(editPlanNutrition.calories.toFixed(1)))} 千卡</strong>
                      </div>
                      <div className={styles.previewItem}>
                        <span>蛋白质</span>
                        <strong>{String(parseFloat(editPlanNutrition.protein.toFixed(1)))} g</strong>
                      </div>
                      <div className={styles.previewItem}>
                        <span>碳水</span>
                        <strong>{String(parseFloat(editPlanNutrition.carbs.toFixed(1)))} g</strong>
                      </div>
                      <div className={styles.previewItem}>
                        <span>脂肪</span>
                        <strong>{String(parseFloat(editPlanNutrition.fat.toFixed(1)))} g</strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.amountRow}>
                      <span>数量</span>
                      <Input
                        inputMode="decimal"
                        value={editServingCountStr}
                        onFocus={(e) => {
                          servingCountPrevRef.current = editServingCountStr
                          setTimeout(() => {
                            e.target.select()
                          }, 0)
                        }}
                        onChange={(val) => {
                          let filtered = val.replace(/[^\d.]/g, '')
                          const parts = filtered.split('.')
                          if (parts.length > 2) {
                            filtered = parts[0] + '.' + parts.slice(1).join('')
                          }
                          setEditServingCountStr(filtered)
                          if (servingCountDebounceRef.current) {
                            clearTimeout(servingCountDebounceRef.current)
                          }
                          if (filtered === '' || filtered === '.') {
                            return
                          }
                          servingCountDebounceRef.current = setTimeout(() => {
                            const num = parseFloat(filtered)
                            if (!isNaN(num) && num > 0) {
                              setEditServingCount(num)
                            }
                          }, 300)
                        }}
                        onBlur={() => {
                          if (servingCountDebounceRef.current) {
                            clearTimeout(servingCountDebounceRef.current)
                          }
                          if (editServingCountStr === '' || editServingCountStr === '.') {
                            const prevVal = servingCountPrevRef.current || '100'
                            setEditServingCountStr(prevVal)
                            const num = parseFloat(prevVal)
                            if (!isNaN(num)) {
                              setEditServingCount(num)
                            }
                          }
                        }}
                        style={{ width: '100px', textAlign: 'right' }}
                      />
                      <span>{editingRecord.food.unit || 'g'}</span>
                    </div>

                    <div className={styles.preview}>
                      <div className={styles.previewItem}>
                        <span>热量</span>
                        <strong>
                          {(() => {
                            const food = editingRecord.food
                            const ratio = editServingCount / food.num
                            return String(parseFloat((food.calorie * ratio).toFixed(1)))
                          })()}
                          千卡
                        </strong>
                      </div>
                      <div className={styles.previewItem}>
                        <span>蛋白质</span>
                        <strong>
                          {(() => {
                            const food = editingRecord.food
                            const ratio = editServingCount / food.num
                            return String(parseFloat((food.protein_g * ratio).toFixed(1)))
                          })()}
                          g
                        </strong>
                      </div>
                      <div className={styles.previewItem}>
                        <span>碳水</span>
                        <strong>
                          {(() => {
                            const food = editingRecord.food
                            const ratio = editServingCount / food.num
                            return String(parseFloat((food.carbs_g * ratio).toFixed(1)))
                          })()}
                          g
                        </strong>
                      </div>
                      <div className={styles.previewItem}>
                        <span>脂肪</span>
                        <strong>
                          {(() => {
                            const food = editingRecord.food
                            const ratio = editServingCount / food.num
                            return String(parseFloat((food.fat_g * ratio).toFixed(1)))
                          })()}
                          g
                        </strong>
                      </div>
                    </div>
                  </>
                )}

                <Button block color="primary" size="large" onClick={handleEditConfirm}>
                  保存
                </Button>
              </>
            )}
          </div>
        </Popup>
      )}

      {showQuickAddPopup && (
        <Popup
          visible={showQuickAddPopup}
          onMaskClick={() => setShowQuickAddPopup(false)}
          bodyStyle={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
          }}
        >
          <div className={styles.editPopup}>
            <div className={styles.editPopupHeader}>
              <Input
                value={quickAddName}
                onChange={setQuickAddName}
                placeholder="食物名称"
                className={styles.editFoodName}
              />
            </div>

            <div className={styles.timeSelector}>
              <label className={styles.timeLabel}>时间</label>
              <input
                type="time"
                value={quickAddTime}
                onChange={(e) => setQuickAddTime(e.target.value)}
                className={styles.timeInput}
              />
            </div>

            <div className={styles.preview}>
              <div className={styles.previewItem}>
                <span>热量</span>
                <div className={styles.previewInputWrapper}>
                  <Input
                    inputMode="decimal"
                    value={quickAddCalories}
                    onChange={(val) => handleQuickAddNumberChange(setQuickAddCalories, val)}
                    onBlur={() => handleQuickAddNumberBlur(setQuickAddCalories, quickAddCalories)}
                    placeholder={quickAddCalories === '' ? '未知' : ''}
                    style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                  />
                  <Selector
                    options={[
                      { label: '千卡', value: 'kcal' },
                      { label: '千焦', value: 'kj' },
                    ]}
                    value={[quickAddCaloriesUnit]}
                    onChange={(arr) => {
                      if (arr.length > 0) {
                        setQuickAddCaloriesUnit(arr[0] as 'kcal' | 'kj')
                      }
                    }}
                    style={{ '--border-radius': '4px', '--padding': '2px 6px', fontSize: '11px' } as React.CSSProperties}
                  />
                </div>
              </div>
              <div className={styles.previewItem}>
                <span>蛋白质</span>
                <div className={styles.previewInputWrapper}>
                  <Input
                    inputMode="decimal"
                    value={quickAddProtein}
                    onChange={(val) => handleQuickAddNumberChange(setQuickAddProtein, val)}
                    onBlur={() => handleQuickAddNumberBlur(setQuickAddProtein, quickAddProtein)}
                    placeholder={quickAddProtein === '' ? '未知' : ''}
                    style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                  />
                  <span className={styles.previewUnit}>g</span>
                </div>
              </div>
              <div className={styles.previewItem}>
                <span>碳水</span>
                <div className={styles.previewInputWrapper}>
                  <Input
                    inputMode="decimal"
                    value={quickAddCarbs}
                    onChange={(val) => handleQuickAddNumberChange(setQuickAddCarbs, val)}
                    onBlur={() => handleQuickAddNumberBlur(setQuickAddCarbs, quickAddCarbs)}
                    placeholder={quickAddCarbs === '' ? '未知' : ''}
                    style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                  />
                  <span className={styles.previewUnit}>g</span>
                </div>
              </div>
              <div className={styles.previewItem}>
                <span>脂肪</span>
                <div className={styles.previewInputWrapper}>
                  <Input
                    inputMode="decimal"
                    value={quickAddFat}
                    onChange={(val) => handleQuickAddNumberChange(setQuickAddFat, val)}
                    onBlur={() => handleQuickAddNumberBlur(setQuickAddFat, quickAddFat)}
                    placeholder={quickAddFat === '' ? '未知' : ''}
                    style={{ width: '60px', textAlign: 'right', border: 'none', padding: '0' }}
                  />
                  <span className={styles.previewUnit}>g</span>
                </div>
              </div>
            </div>

            <Button block color="danger" size="large" onClick={handleQuickAddConfirm}>
              保存
            </Button>
          </div>
        </Popup>
      )}

      <input
        ref={dateInputRef}
        type="date"
        value={selectedDate}
        onChange={handleDateChange}
        min="2020-01-01"
        max="2030-12-31"
        className={styles.hiddenDateInput}
      />

    </div>
  )
}
