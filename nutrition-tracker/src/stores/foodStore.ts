import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Food } from '../types'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'
import { generateUUID } from '../db/db'

const LOCAL_ACCOUNT_ID = 'local-account'

interface FoodState {
  foods: Food[]
  foodUsageCounts: Record<string, number>
  lastUsedServings: Record<string, number>
  savedFoodIds: Record<string, string[]>
  newlyCreatedFoodIds: string[]
  modifiedFoodIds: string[]
  addFood: (food: Food) => void
  updateFood: (id: string, food: Partial<Food>) => void
  deleteFood: (id: string) => void
  setFoods: (foods: Food[]) => void
  searchFoods: (keyword: string) => Food[]
  getFoodById: (id: string) => Food | undefined
  getFoodUsageCount: (foodId: string, userId?: string) => number
  incrementFoodUsage: (foodId: string, userId?: string) => void
  getLastUsedServing: (foodId: string, userId?: string) => number | null
  setLastUsedServing: (foodId: string, serving: number, userId?: string) => void
  isFoodSaved: (foodId: string, userId?: string) => boolean
  saveFoodToAccount: (foodId: string, userId?: string) => void
  removeFoodFromAccount: (foodId: string, userId?: string) => void
  getSavedFoodsForAccount: (userId?: string) => Food[]
  clearFoods: () => void
  markFoodAsNew: (foodId: string) => void
  clearNewFoods: () => void
  markFoodAsModified: (foodId: string) => void
  clearModifiedFoods: () => void
}

export const useFoodStore = create<FoodState>()(
  persist(
    (set, get) => ({
      foods: [],
      foodUsageCounts: {},
      lastUsedServings: {},
      savedFoodIds: {},
      newlyCreatedFoodIds: [],
      modifiedFoodIds: [],
      
      addFood: (food) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const foodWithUserId = { ...food, user_id: userId }
        set((state) => {
          const currentSavedIds = state.savedFoodIds[userId] || []
          return {
            foods: [...state.foods, foodWithUserId],
            savedFoodIds: {
              ...state.savedFoodIds,
              [userId]: [...currentSavedIds, food.id],
            },
          }
        })
        useOperationStore.getState().addOperation('food', food.id, foodWithUserId)
      },
      
      updateFood: (id, food) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        let updatedFoodData: Food | null = null
        let targetId = id
        
        set((state) => {
          const existingFood = state.foods.find(f => f.id === id)
          if (!existingFood) return state
          
          const originalUserId = existingFood.user_id || LOCAL_ACCOUNT_ID
          
          if (originalUserId === userId) {
            const updatedFood: Food = {
              ...existingFood,
              ...food,
            }
            updatedFoodData = updatedFood
            return {
              foods: state.foods.map((f) => (f.id === id ? updatedFood : f)),
              modifiedFoodIds: [...state.modifiedFoodIds, id],
            }
          } else {
            const newId = generateUUID()
            const newFood: Food = {
              ...existingFood,
              ...food,
              id: newId,
              user_id: userId,
            }
            updatedFoodData = newFood
            targetId = newId
            const currentSavedIds = state.savedFoodIds[userId] || []
            const newSavedIds = [...currentSavedIds.filter(savedId => savedId !== id), newId]
            return {
              foods: [...state.foods, newFood],
              savedFoodIds: {
                ...state.savedFoodIds,
                [userId]: newSavedIds,
              },
              modifiedFoodIds: [...state.modifiedFoodIds, newId],
            }
          }
        })
        
        if (updatedFoodData) {
          useOperationStore.getState().addOperation('food', targetId, updatedFoodData, 'update')
        }
      },
      
      deleteFood: (id) => {
        const food = get().foods.find(f => f.id === id)
        set((state) => ({
          foods: state.foods.filter((f) => f.id !== id),
        }))
        useOperationStore.getState().deleteOperation('food', id, food)
      },
      
      setFoods: (foods) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const currentAccountFoodIds = foods
          .filter(food => (food.user_id || LOCAL_ACCOUNT_ID) === userId)
          .map(food => food.id)
        set((state) => ({
          foods: foods,
          savedFoodIds: {
            ...state.savedFoodIds,
            [userId]: [...new Set([...(state.savedFoodIds[userId] || []), ...currentAccountFoodIds])],
          },
        }))
      },
      
      searchFoods: (keyword) => {
        const { foods } = get()
        if (!keyword.trim()) return foods
        return foods.filter((food) =>
          food.name.toLowerCase().includes(keyword.toLowerCase())
        )
      },
      
      getFoodById: (id) => {
        return get().foods.find((f) => f.id === id)
      },

      getFoodUsageCount: (foodId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const key = `${foodId}:${targetUserId}`
        return get().foodUsageCounts[key] || 0
      },

      incrementFoodUsage: (foodId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const key = `${foodId}:${targetUserId}`
        set((state) => ({
          foodUsageCounts: {
            ...state.foodUsageCounts,
            [key]: (state.foodUsageCounts[key] || 0) + 1,
          },
        }))
      },

      getLastUsedServing: (foodId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const key = `${foodId}:${targetUserId}`
        const value = get().lastUsedServings[key]
        return value !== undefined ? value : null
      },

      setLastUsedServing: (foodId, serving, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const key = `${foodId}:${targetUserId}`
        set((state) => ({
          lastUsedServings: {
            ...state.lastUsedServings,
            [key]: serving,
          },
        }))
      },
      
      clearFoods: () => {
        set({ foods: [] })
      },

      isFoodSaved: (foodId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const savedIds = get().savedFoodIds[targetUserId] || []
        return savedIds.includes(foodId)
      },

      saveFoodToAccount: (foodId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        set((state) => {
          const savedIds = state.savedFoodIds[targetUserId] || []
          if (savedIds.includes(foodId)) return state
          return {
            savedFoodIds: {
              ...state.savedFoodIds,
              [targetUserId]: [...savedIds, foodId],
            },
          }
        })
      },

      removeFoodFromAccount: (foodId, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        set((state) => {
          const savedIds = state.savedFoodIds[targetUserId] || []
          return {
            savedFoodIds: {
              ...state.savedFoodIds,
              [targetUserId]: savedIds.filter((id) => id !== foodId),
            },
          }
        })
      },

      getSavedFoodsForAccount: (userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        const savedIds = get().savedFoodIds[targetUserId] || []
        return get().foods.filter((f) => savedIds.includes(f.id))
      },

      markFoodAsNew: (foodId) => {
        set((state) => ({
          newlyCreatedFoodIds: [...state.newlyCreatedFoodIds, foodId],
        }))
      },

      clearNewFoods: () => {
        set({ newlyCreatedFoodIds: [] })
      },

      markFoodAsModified: (foodId) => {
        set((state) => ({
          modifiedFoodIds: [...state.modifiedFoodIds, foodId],
        }))
      },

      clearModifiedFoods: () => {
        set({ modifiedFoodIds: [] })
      },
    }),
    {
      name: 'food-storage',
      partialize: (state) => {
        const { newlyCreatedFoodIds, modifiedFoodIds, ...rest } = state
        return rest
      },
    }
  )
)

