import type { NutrientInfo, UserGoals, DailyGoal } from '../types'

export const DEFAULT_DAILY_GOAL: DailyGoal = {
  calorie_target: 2000,
  carb_target_g: 250,
  protein_target_g: 150,
  fat_target_g: 65,
}

export const DEFAULT_GOAL: UserGoals = {
  cycle_days: 1,
  today_index: 0,
  daily_goals: [DEFAULT_DAILY_GOAL],
  calorie_target: 2000,
  carb_target_g: 250,
  protein_target_g: 150,
  fat_target_g: 65,
}

export const NUTRIENT_INFO: NutrientInfo[] = [
  { key: 'calories', name: '热量', unit: 'kcal', color: '#ff6b6b' },
  { key: 'protein', name: '蛋白质', unit: 'g', color: '#4ecdc4' },
  { key: 'carbs', name: '碳水', unit: 'g', color: '#ffe66d' },
  { key: 'fat', name: '脂肪', unit: 'g', color: '#95e1d3' },
]

export const FOOD_CATEGORIES = [
  { key: 'staple', name: '主食' },
  { key: 'protein', name: '蛋白' },
  { key: 'vegetable', name: '蔬菜' },
  { key: 'fruit', name: '水果' },
  { key: 'snack', name: '零食' },
  { key: 'drink', name: '饮品' },
]
