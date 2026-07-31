import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavBar, SearchBar, Toast, Popup, Dialog } from 'antd-mobile'
import { useFoodStore, useAuthStore, usePlanStore } from '../../stores'
import { localPlanToApiFormat } from '../../stores/planStore'
import type { Food, MealPlan } from '../../types'
import FoodItemRow from '../../components/FoodItemRow'
import styles from './index.module.css'

const LOCAL_ACCOUNT_ID = 'local-account'

interface AccountInfo {
  id: string
  email: string
  isLocal: boolean
}

export default function FoodLibraryPage() {
  const navigate = useNavigate()
  const { foods, newlyCreatedFoodIds, savedFoodIds, isFoodSaved, saveFoodToAccount, removeFoodFromAccount } = useFoodStore()
  const { localPlans, deleteLocalPlan, newlyCreatedPlanIds, savedPlanIds, isPlanSaved, savePlanToAccount, removePlanFromAccount } = usePlanStore()
  const { savedAccounts, currentAccountId } = useAuthStore()

  const [keyword, setKeyword] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState(currentAccountId)
  const [showAccountSelector, setShowAccountSelector] = useState(false)

  const plans = useMemo<MealPlan[]>(() => {
    return localPlans.map(plan => localPlanToApiFormat(plan))
  }, [localPlans, foods])

  const isFoodOwnedByCurrentAccount = (food: Food): boolean => {
    if (!food.user_id) return currentAccountId === LOCAL_ACCOUNT_ID
    return food.user_id === currentAccountId
  }

  const isPlanOwnedByCurrentAccount = (plan: MealPlan): boolean => {
    if (!plan.user_id) return currentAccountId === LOCAL_ACCOUNT_ID
    return plan.user_id === currentAccountId
  }

  const handleAddFoodToCurrentAccount = (food: Food) => {
    if (isFoodSaved(food.id)) {
      Toast.show('该食物已保存')
      return
    }
    saveFoodToAccount(food.id)
    Toast.show('已保存到当前账号')
  }

  const handleAddPlanToCurrentAccount = (plan: MealPlan) => {
    if (isPlanSaved(plan.id)) {
      Toast.show('该套餐已保存')
      return
    }
    savePlanToAccount(plan.id)
    Toast.show('已保存到当前账号')
  }

  const handleDeleteFoodCopy = (food: Food) => {
    removeFoodFromAccount(food.id)
    Toast.show('已从当前账号移除')
  }

  const handleDeletePlanCopy = (plan: MealPlan) => {
    removePlanFromAccount(plan.id)
    Toast.show('已从当前账号移除')
  }

  const accounts: AccountInfo[] = [
    { id: LOCAL_ACCOUNT_ID, email: '本地账号', isLocal: true },
    ...savedAccounts.map(acc => ({
      id: acc.user.id,
      email: acc.user.email,
      isLocal: false,
    })),
  ]

  const filteredFoods = useMemo(() => {
    const newFoodSet = new Set(newlyCreatedFoodIds)
    const targetUserId = selectedAccountId === 'all' ? '' : (selectedAccountId || LOCAL_ACCOUNT_ID)
    const savedIds = targetUserId ? (savedFoodIds[targetUserId] || []) : []
    const savedSet = new Set(savedIds)
    const result = foods.filter(food => {
      const matchKeyword = food.name.toLowerCase().includes(keyword.toLowerCase())
      let matchAccount = true
      if (targetUserId) {
        const owned = (food.user_id || LOCAL_ACCOUNT_ID) === targetUserId
        matchAccount = owned || savedSet.has(food.id)
      }
      return matchKeyword && matchAccount
    })
    const newItems = result.filter(f => newFoodSet.has(f.id))
    const normalItems = result.filter(f => !newFoodSet.has(f.id))
    return [...newItems, ...normalItems]
  }, [foods, keyword, selectedAccountId, newlyCreatedFoodIds, savedFoodIds])

  const filteredPlans = useMemo(() => {
    const newPlanSet = new Set(newlyCreatedPlanIds)
    const targetUserId = selectedAccountId === 'all' ? '' : (selectedAccountId || LOCAL_ACCOUNT_ID)
    const savedIds = targetUserId ? (savedPlanIds[targetUserId] || []) : []
    const savedSet = new Set(savedIds)
    const result = plans.filter(plan => {
      const matchKeyword = plan.name.toLowerCase().includes(keyword.toLowerCase())
      let matchAccount = true
      if (targetUserId) {
        const owned = (plan.user_id || LOCAL_ACCOUNT_ID) === targetUserId
        matchAccount = owned || savedSet.has(plan.id)
      }
      return matchKeyword && matchAccount
    })
    const newItems = result.filter(p => newPlanSet.has(p.id))
    const normalItems = result.filter(p => !newPlanSet.has(p.id))
    return [...newItems, ...normalItems]
  }, [plans, keyword, selectedAccountId, newlyCreatedPlanIds, savedPlanIds])

  const getFoodSource = (userId: string): string => {
    if (!userId) return '本地账号'
    if (userId === LOCAL_ACCOUNT_ID) return '本地账号'
    const account = savedAccounts.find(acc => acc.user.id === userId)
    return account ? account.user.email : userId
  }

  const handleDeleteFood = async (food: Food) => {
    if (!food.user_id) {
      Toast.show('系统食物不能删除')
      return
    }

    Dialog.confirm({
      content: `确定删除自定义食物 "${food.name}" 吗？`,
      onConfirm: async () => {
        const { deleteFood } = useFoodStore.getState()
        deleteFood(food.id)
        Toast.show('已删除')
      },
    })
  }

  const handleEditFood = (food: Food) => {
    if (!food.user_id) {
      Toast.show('系统食物不能编辑')
      return
    }
    if (!isFoodOwnedByCurrentAccount(food)) {
      Toast.show('仅归属账号可编辑')
      return
    }
    navigate(`/foods/edit/${food.id}`)
  }

  const handleDeletePlan = async (plan: MealPlan) => {
    const result = await Dialog.confirm({
      content: `确定删除套餐 "${plan.name}" 吗？`,
    })
    if (result) {
      try {
        deleteLocalPlan(plan.id)
        Toast.show('已删除')
      } catch (error) {
        console.error('Failed to delete plan:', error)
        Toast.show('删除失败')
      }
    }
  }

  const handleEditPlan = (plan: MealPlan) => {
    if (!isPlanOwnedByCurrentAccount(plan)) {
      Toast.show('仅归属账号可编辑')
      return
    }
    navigate(`/plans/edit/${plan.id}`)
  }

  return (
    <div className={styles.container}>
      <NavBar onBack={() => navigate(-1)}>食物库</NavBar>

      <div className={styles.searchSection}>
        <SearchBar
          placeholder="搜索食物"
          value={keyword}
          onChange={setKeyword}
        />
      </div>

      <div className={styles.accountSelector}>
        <div
          className={styles.accountSelectorTrigger}
          onClick={() => setShowAccountSelector(true)}
        >
          <span className={styles.accountLabel}>
            {selectedAccountId === 'all' ? '全部账号' : getAccountLabel(selectedAccountId)}
          </span>
          <span className={styles.arrow}>▼</span>
        </div>
      </div>

      <div className={styles.content}>
        {filteredFoods.length === 0 && filteredPlans.length === 0 ? (
          <div className={styles.empty}>
            <p>暂无食物</p>
          </div>
        ) : (
          <div className={styles.foodList}>
            {filteredFoods.map((food) => {
              const isNew = newlyCreatedFoodIds.includes(food.id)
              const foodTags: { text: string; color: string }[] = []
              if (isNew) foodTags.push({ text: '新', color: 'success' })
              const owned = isFoodOwnedByCurrentAccount(food)
              const saved = isFoodSaved(food.id)
              const showDeleteBtn = owned || (!owned && saved)
              return (
                <FoodItemRow
                  key={`food-${food.id}`}
                  name={food.name}
                  calories={food.calorie}
                  servingText={`${food.num} ${food.unit}`}
                  tags={foodTags.length > 0 ? foodTags : undefined}
                  lastModifiedBy={getFoodSource(food.user_id || LOCAL_ACCOUNT_ID)}
                  onClick={() => {}}
                  showEdit={owned}
                  showDelete={showDeleteBtn}
                  showAdd={!owned && !saved}
                  onEdit={() => handleEditFood(food)}
                  onDelete={() => owned ? handleDeleteFood(food) : handleDeleteFoodCopy(food)}
                  onAdd={() => handleAddFoodToCurrentAccount(food)}
                />
              )
            })}
            {filteredPlans.map((plan) => {
              const planOwned = isPlanOwnedByCurrentAccount(plan)
              const isNew = newlyCreatedPlanIds.includes(plan.id)
              const planTags: { text: string; color: string }[] = []
              if (isNew) planTags.push({ text: '新', color: 'success' })
              planTags.push({ text: '套餐', color: 'success' })
              const saved = isPlanSaved(plan.id)
              const showDeleteBtn = planOwned || (!planOwned && saved)
              return (
                <FoodItemRow
                  key={`plan-${plan.id}`}
                  name={plan.name}
                  calories={plan.total_calories}
                  servingText={`${plan.item_count} 项`}
                  tags={planTags}
                  lastModifiedBy={getFoodSource(plan.user_id || LOCAL_ACCOUNT_ID)}
                  onClick={() => {}}
                  showEdit={planOwned}
                  showDelete={showDeleteBtn}
                  showAdd={!planOwned && !saved}
                  onEdit={() => handleEditPlan(plan)}
                  onDelete={() => planOwned ? handleDeletePlan(plan) : handleDeletePlanCopy(plan)}
                  onAdd={() => handleAddPlanToCurrentAccount(plan)}
                />
              )
            })}
          </div>
        )}
      </div>

      <Popup
        visible={showAccountSelector}
        onMaskClick={() => setShowAccountSelector(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
        }}
      >
        <h3 className={styles.popupTitle}>选择账号</h3>
        <div className={styles.accountList}>
          <div
            className={`${styles.accountItem} ${selectedAccountId === 'all' ? styles.active : ''}`}
            onClick={() => {
              setSelectedAccountId('all')
              setShowAccountSelector(false)
            }}
          >
            全部账号
          </div>
          {accounts.map((account) => (
            <div
              key={account.id}
              className={`${styles.accountItem} ${selectedAccountId === account.id ? styles.active : ''}`}
              onClick={() => {
                setSelectedAccountId(account.id)
                setShowAccountSelector(false)
              }}
            >
              {account.email}
            </div>
          ))}
        </div>
      </Popup>
    </div>
  )

  function getAccountLabel(accountId: string): string {
    if (accountId === LOCAL_ACCOUNT_ID) return '本地账号'
    const account = savedAccounts.find(acc => acc.user.id === accountId)
    return account ? account.user.email : accountId
  }
}

