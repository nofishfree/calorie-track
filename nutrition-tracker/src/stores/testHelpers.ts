import type { Food, MealRecord } from '../types'
import { useAuthStore } from './authStore'
import { useFoodStore } from './foodStore'
import { useOperationStore } from './operationStore'
import { usePlanStore } from './planStore'
import { useRecordStore } from './recordStore'

export const account = {
  id: 'user-1',
  email: 'user@example.com',
  data_version: 2,
}

export const food = (id: string, user_id?: string): Food => ({
  id,
  name: id === 'food-1' ? 'Oats' : 'Rice',
  num: 100,
  calorie: 200,
  calorie_unit: 'kcal',
  carbs_g: 30,
  protein_g: 10,
  fat_g: 5,
  unit: 'g',
  user_id,
})

export const record = (
  id: string,
  user_id: string,
  record_time: string,
  totals: Partial<Pick<MealRecord, 'calories_total' | 'carbs_total' | 'protein_total' | 'fat_total'>> = {},
): MealRecord => ({
  id,
  user_id,
  food: food(`${id}-food`, user_id),
  serving_count: 1,
  record_time,
  calories_total: totals.calories_total ?? 100,
  carbs_total: totals.carbs_total ?? 20,
  protein_total: totals.protein_total ?? 10,
  fat_total: totals.fat_total ?? 5,
})

export function resetStores() {
  useAuthStore.setState({
    user: { id: 'local-account', email: '本地账号', username: '本地账号', data_version: 0 },
    token: null,
    isLoggedIn: false,
    isLocalAccount: true,
    savedAccounts: [],
    currentAccountId: 'local-account',
  })
  useOperationStore.setState({ queues: {}, isSyncing: false, pollingTimer: null })
  useFoodStore.setState({
    foods: [],
    foodUsageCounts: {},
    lastUsedServings: {},
    savedFoodIds: {},
    newlyCreatedFoodIds: [],
    modifiedFoodIds: [],
  })
  useRecordStore.setState({ records: [] })
  usePlanStore.setState({
    localPlans: [],
    planUsageCounts: {},
    savedPlanIds: {},
    newlyCreatedPlanIds: [],
    modifiedPlanIds: [],
  })
}
