import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchBar, Popup, Button, Tag, Toast, Tabs, Dialog, Input } from 'antd-mobile'
import { useFoodStore, useRecordStore } from '../stores'
import { getToday, getCurrentTime } from '../utils/helpers'
import type { Food } from '../types'
import dayjs from 'dayjs'
import styles from './AddRecordPanel.module.css'

interface Props {
  visible: boolean
  onClose: () => void
  onRecordAdded: () => void
}

export default function AddRecordPanel({ visible, onClose, onRecordAdded }: Props) {
  const navigate = useNavigate()

  const [keyword, setKeyword] = useState('')
  const [selectedTime, setSelectedTime] = useState(getCurrentTime())
  const [showAmountPopup, setShowAmountPopup] = useState(false)
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [servingCount, setServingCount] = useState(1)
  const [servingCountStr, setServingCountStr] = useState('1')
  const servingCountPrevRef = useRef('1')
  const servingCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'custom'>('all')
  const [selectedUnit, setSelectedUnit] = useState('')
  const timeInputRef = useRef<HTMLInputElement>(null)

  const { foods, deleteFood } = useFoodStore()
  const { addRecord } = useRecordStore()

  useEffect(() => {
    if (visible) {
      // 数据已从 foodStore 获取，无需额外加载
    }
  }, [visible, activeTab])

  const filteredFoods = useMemo(() => {
    if (!keyword.trim()) return foods
    return foods.filter((food) =>
      food.name.toLowerCase().includes(keyword.toLowerCase())
    )
  }, [keyword, foods])

  const handleFoodSelect = (food: Food) => {
    setSelectedFood(food)
    const initialCount = food.num || 100
    setServingCount(initialCount)
    setServingCountStr(String(initialCount))
    servingCountPrevRef.current = String(initialCount)
    setSelectedUnit(food.unit || 'g')
    setShowAmountPopup(true)
  }

  const handleConfirm = () => {
    if (!selectedFood) return

    const record_time = dayjs(`${getToday()}T${selectedTime}:00`).toISOString()
    
    const ratio = servingCount / selectedFood.num
    const calories = Math.round(selectedFood.calorie * ratio * 100) / 100
    const protein = Math.round(selectedFood.protein_g * ratio * 100) / 100
    const fat = Math.round(selectedFood.fat_g * ratio * 100) / 100
    const carbs = Math.round(selectedFood.carbs_g * ratio * 100) / 100

    addRecord({
      food: selectedFood,
      serving_count: ratio,
      record_time,
      calories_total: calories,
      carbs_total: carbs,
      protein_total: protein,
      fat_total: fat,
    })

    Toast.show('记录已添加')
    onRecordAdded()

    setShowAmountPopup(false)
    setSelectedFood(null)
    onClose()
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedTime(e.target.value)
  }

  const handleDeleteFood = async (food: Food) => {
    const result = await Dialog.confirm({
      content: `确定删除自定义食物 "${food.name}" 吗？`,
    })
    if (result) {
      try {
        deleteFood(food.id)
        Toast.show('已删除')
        setShowAmountPopup(false)
        setSelectedFood(null)
      } catch (error) {
        console.error('Failed to delete food:', error)
        Toast.show('删除失败')
      }
    }
  }

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      bodyStyle={{
        height: '100vh',
        maxHeight: '100vh',
        borderRadius: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <h2 className={styles.title}>添加记录</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </header>

        <div className={styles.timeSelector}>
          <label className={styles.timeLabel}>时间</label>
          <input
            ref={timeInputRef}
            type="time"
            value={selectedTime}
            onChange={handleTimeChange}
            className={styles.timeInput}
          />
        </div>

        <div className={styles.searchSection}>
          <SearchBar
            placeholder="搜索食物"
            value={keyword}
            onChange={setKeyword}
            style={{ '--background': 'var(--card-bg)' }}
          />
          <Button
            className={styles.addCustomBtn}
            color="primary"
            fill="outline"
            onClick={() => {
              const searchParam = keyword.trim() ? `?name=${encodeURIComponent(keyword.trim())}` : ''
              navigate(`/foods/create-item${searchParam}`)
            }}
          >
            {keyword.trim() ? `+ 新建 "${keyword.trim()}"` : '+ 新建食物'}
          </Button>
        </div>

        <div className={styles.tabsContainer}>
          <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key as 'all' | 'custom')}>
            <Tabs.Tab title="全部食物" key="all" />
            <Tabs.Tab title="自定义食物" key="custom" />
          </Tabs>
        </div>

        <div className={styles.content}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              {keyword === '' ? (activeTab === 'all' ? '全部食物' : '自定义食物') : '搜索结果'}
            </h3>
            {filteredFoods.length === 0 ? (
              <div className={styles.emptyState}>
                <p>暂无食物数据</p>
              </div>
            ) : (
              <div className={styles.foodList}>
                  {filteredFoods.map((food) => (
                    <div
                      key={food.id}
                      className={styles.foodItem}
                      onClick={() => handleFoodSelect(food)}
                    >
                      <div className={styles.foodInfo}>
                        <div className={styles.foodNameRow}>
                          <span className={styles.foodName}>{food.name}</span>
                          {food.user_id && (
                            <Tag color="primary" style={{ marginLeft: 8 }}>
                              自定义
                            </Tag>
                          )}
                        </div>
                        <div className={styles.foodMeta}>
                          <span className={styles.foodCal}>
                            {food.calorie.toFixed(2)} kcal / {food.num} {food.unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </section>
        </div>
      </div>

      <Popup
        visible={showAmountPopup}
        onMaskClick={() => setShowAmountPopup(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
        }}
      >
        {selectedFood && (
          <div className={styles.popup}>
            <div className={styles.popupHeader}>
              <h3 className={styles.popupTitle}>{selectedFood.name}</h3>
              {selectedFood.user_id && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDeleteFood(selectedFood)}
                >
                  删除
                </button>
              )}
            </div>
            
            <div className={styles.amountRow}>
              <span>数量</span>
              <Input
                inputMode="decimal"
                value={servingCountStr}
                onFocus={(e) => {
                  servingCountPrevRef.current = servingCountStr
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
                  setServingCountStr(filtered)
                  if (servingCountDebounceRef.current) {
                    clearTimeout(servingCountDebounceRef.current)
                  }
                  if (filtered === '' || filtered === '.') {
                    return
                  }
                  servingCountDebounceRef.current = setTimeout(() => {
                    const num = parseFloat(filtered)
                    if (!isNaN(num) && num > 0) {
                      setServingCount(num)
                    }
                  }, 300)
                }}
                onBlur={() => {
                  if (servingCountDebounceRef.current) {
                    clearTimeout(servingCountDebounceRef.current)
                  }
                  if (servingCountStr === '' || servingCountStr === '.') {
                    const prevVal = servingCountPrevRef.current || String(selectedFood?.num || 100)
                    setServingCountStr(prevVal)
                  }
                }}
                style={{ width: '100px', textAlign: 'right' }}
              />
              <span>{selectedUnit}</span>
            </div>
            <div className={styles.preview}>
              <div className={styles.previewItem}>
                <span>热量</span>
                <strong>
                  {(selectedFood.calorie * servingCount / selectedFood.num).toFixed(2)}
                  kcal
                </strong>
              </div>
              <div className={styles.previewItem}>
                <span>蛋白质</span>
                <strong>
                  {(selectedFood.protein_g * servingCount / selectedFood.num).toFixed(2)}
                  g
                </strong>
              </div>
              <div className={styles.previewItem}>
                <span>碳水</span>
                <strong>
                  {(selectedFood.carbs_g * servingCount / selectedFood.num).toFixed(2)}
                  g
                </strong>
              </div>
              <div className={styles.previewItem}>
                <span>脂肪</span>
                <strong>
                  {(selectedFood.fat_g * servingCount / selectedFood.num).toFixed(2)}
                  g
                </strong>
              </div>
            </div>
            <Button block color="primary" size="large" onClick={handleConfirm}>
              确认添加
            </Button>
          </div>
        )}
      </Popup>
    </Popup>
  )
}
