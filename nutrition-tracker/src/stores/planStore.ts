import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MealPlanDetail, PlanItem, Food } from '../types'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'

const LOCAL_ACCOUNT_ID = 'local-account'

interface LocalPlanItem {
  food_id: string
  food: Food
  quantity: number
}

interface LocalMealPlan {
  id: string
  name: string
  items: LocalPlanItem[]
  user_id: string
  created_at: string
}

interface PlanState {
  localPlans: LocalMealPlan[]
  planUsageCounts: Record<string, number>
  savedPlanIds: Record<string, string[]>
  newlyCreatedPlanIds: string[]
  modifiedPlanIds: string[]
  addLocalPlan: (name: string, items: LocalPlanItem[], userId: string) => LocalMealPlan
  updateLocalPlan: (id: string, name: string, items: LocalPlanItem[]) => void
  deleteLocalPlan: (id: string) => void
  getLocalPlanDetail: (id: string) => MealPlanDetail | null
  getPlanUsageCount: (planId: string, userId?: string) => number
  incrementPlanUsage: (planId: string, userId?: string) => void
  isPlanSaved: (planId: string, userId?: string) => boolean
  savePlanToAccount: (planId: string, userId?: string) => void
  removePlanFromAccount: (planId: string, userId?: string) => void
  markPlanAsNew: (planId: string) => void
  clearNewPlans: () => void
  markPlanAsModified: (planId: string) => void
  clearModifiedPlans: () => void
  clearPlans: () => void
  clearPlansForAccount: (accountId: string) => void
  applyRemoteOperation: (operation_type: string, data: Record<string, unknown>) => void
}

const generateUUID = (): string => {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set, get) => ({
      localPlans: [],
      planUsageCounts: {},
      savedPlanIds: {},
      newlyCreatedPlanIds: [],
      modifiedPlanIds: [],

      addLocalPlan: (name, items, userId) => {
        const newPlan: LocalMealPlan = {
          id: generateUUID(),
          name,
          items,
          user_id: userId,
          created_at: new Date().toISOString(),
        }
        set((state) => ({
          localPlans: [newPlan, ...state.localPlans],
        }))
        useOperationStore.getState().addOperation('plan', newPlan)
        return newPlan
      },

      updateLocalPlan: (id, name, items) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        let updatedPlanData: LocalMealPlan | null = null
        
        set((state) => {
          const existingPlan = state.localPlans.find(p => p.id === id)
          if (!existingPlan) return state
          
          const originalUserId = existingPlan.user_id || LOCAL_ACCOUNT_ID
          
          if (originalUserId === userId) {
            const updatedPlan: LocalMealPlan = { ...existingPlan, name, items }
            updatedPlanData = updatedPlan
            return {
              localPlans: state.localPlans.map((plan) =>
                plan.id === id ? updatedPlan : plan
              ),
              modifiedPlanIds: [...state.modifiedPlanIds, id],
            }
          } else {
            const newId = generateUUID()
            const newPlan: LocalMealPlan = {
              id: newId,
              name,
              items,
              user_id: userId,
              created_at: new Date().toISOString(),
            }
            updatedPlanData = newPlan
            return {
              localPlans: [...state.localPlans, newPlan],
              modifiedPlanIds: [...state.modifiedPlanIds, newId],
            }
          }
        })
        
        if (updatedPlanData) {
          useOperationStore.getState().addOperation('plan', updatedPlanData, 'update')
        }
      },

      deleteLocalPlan: (id) => {
        const plan = get().localPlans.find(p => p.id === id)
        set((state) => ({
          localPlans: state.localPlans.filter((plan) => plan.id !== id),
        }))
        useOperationStore.getState().deleteOperation('plan', plan)
      },

      getPlanUsageCount: (planId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const key = `${planId}:${targetUserId}`
        return get().planUsageCounts[key] || 0
      },

      incrementPlanUsage: (planId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const key = `${planId}:${targetUserId}`
        set((state) => ({
          planUsageCounts: {
            ...state.planUsageCounts,
            [key]: (state.planUsageCounts[key] || 0) + 1,
          },
        }))
      },

      isPlanSaved: (planId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const savedIds = get().savedPlanIds[targetUserId] || []
        return savedIds.includes(planId)
      },

      savePlanToAccount: (planId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        set((state) => {
          const savedIds = state.savedPlanIds[targetUserId] || []
          if (savedIds.includes(planId)) return state
          return {
            savedPlanIds: {
              ...state.savedPlanIds,
              [targetUserId]: [...savedIds, planId],
            },
          }
        })
      },

      removePlanFromAccount: (planId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        set((state) => {
          const savedIds = state.savedPlanIds[targetUserId] || []
          return {
            savedPlanIds: {
              ...state.savedPlanIds,
              [targetUserId]: savedIds.filter((id) => id !== planId),
            },
          }
        })
      },

      markPlanAsNew: (planId) => {
        set((state) => ({
          newlyCreatedPlanIds: [...state.newlyCreatedPlanIds, planId],
        }))
      },

      clearNewPlans: () => {
        set({ newlyCreatedPlanIds: [] })
      },

      markPlanAsModified: (planId) => {
        set((state) => ({
          modifiedPlanIds: [...state.modifiedPlanIds, planId],
        }))
      },

      clearModifiedPlans: () => {
        set({ modifiedPlanIds: [] })
      },

      clearPlans: () => {
        set({ localPlans: [] })
      },

      clearPlansForAccount: (accountId) => {
        set((state) => {
          // 仅移除该账号的计划，保留其他账号的数据
          const remainingPlans = state.localPlans.filter(p => p.user_id !== accountId)
          // 清除该账号的使用次数记录
          const remainingUsageCounts: Record<string, number> = {}
          for (const [key, val] of Object.entries(state.planUsageCounts)) {
            if (!key.endsWith(`:${accountId}`)) remainingUsageCounts[key] = val
          }
          // 清除该账号的已保存计划ID
          const { [accountId]: _removed, ...remainingSavedPlanIds } = state.savedPlanIds
          return {
            localPlans: remainingPlans,
            planUsageCounts: remainingUsageCounts,
            savedPlanIds: remainingSavedPlanIds,
          }
        })
      },

      applyRemoteOperation: (operation_type, data) => {
        const id = data.id as string
        if (operation_type === 'delete') {
          set((state) => ({ localPlans: state.localPlans.filter(p => p.id !== id) }))
        } else {
          // add 或 update 均为 upsert，不创建新操作
          const planData = data as unknown as LocalMealPlan
          set((state) => {
            const exists = state.localPlans.some(p => p.id === id)
            if (exists) {
              return { localPlans: state.localPlans.map(p => p.id === id ? { ...p, ...planData } : p) }
            }
            return { localPlans: [...state.localPlans, planData] }
          })
        }
      },

      getLocalPlanDetail: (id) => {
        const plan = get().localPlans.find((p) => p.id === id)
        if (!plan) return null

        let totalCalories = 0
        let totalProtein = 0
        let totalFat = 0
        let totalCarbs = 0

        const planItems: PlanItem[] = plan.items.map((item, index) => {
          const food = item.food
          const ratio = item.quantity / food.num
          totalCalories += food.calorie * ratio
          totalProtein += food.protein_g * ratio
          totalFat += food.fat_g * ratio
          totalCarbs += food.carbs_g * ratio

          return {
            id: generateUUID(),
            food_id: item.food_id,
            food: food,
            quantity: item.quantity,
            sort_order: index,
          }
        })

        return {
          id: plan.id,
          user_id: plan.user_id,
          name: plan.name,
          item_count: plan.items.length,
          total_calories: Math.round(totalCalories * 100) / 100,
          total_protein: Math.round(totalProtein * 100) / 100,
          total_fat: Math.round(totalFat * 100) / 100,
          total_carbs: Math.round(totalCarbs * 100) / 100,
          created_at: plan.created_at,
          updated_at: plan.created_at,
          items: planItems,
        }
      },
    }),
    {
      name: 'plan-storage',
      partialize: (state) => {
        const { newlyCreatedPlanIds, modifiedPlanIds, ...rest } = state
        return rest
      },
    }
  )
)

export function localPlanToApiFormat(plan: LocalMealPlan) {
  let totalCalories = 0
  let totalProtein = 0
  let totalFat = 0
  let totalCarbs = 0

  plan.items.forEach((item) => {
    const food = item.food
    const ratio = item.quantity / food.num
    totalCalories += food.calorie * ratio
    totalProtein += food.protein_g * ratio
    totalFat += food.fat_g * ratio
    totalCarbs += food.carbs_g * ratio
  })

  return {
    id: plan.id,
    user_id: plan.user_id,
    name: plan.name,
    item_count: plan.items.length,
    total_calories: Math.round(totalCalories * 100) / 100,
    total_protein: Math.round(totalProtein * 100) / 100,
    total_fat: Math.round(totalFat * 100) / 100,
    total_carbs: Math.round(totalCarbs * 100) / 100,
    created_at: plan.created_at,
    updated_at: plan.created_at,
  }
}

