import type { Food, MealRecord } from '../types'

/** 1 kcal = 4.184 kJ */
export const KJ_PER_KCAL = 4.184

export interface NutritionTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface FoodPortion {
  food: Food
  quantity: number
}

export const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export const kjToKcal = (kj: number, decimals = 2) => round(kj / KJ_PER_KCAL, decimals)

export const kcalToKj = (kcal: number, decimals = 2) => round(kcal * KJ_PER_KCAL, decimals)

/** 将输入的热量按其单位换算为 kcal，负数（未填写哨兵值）原样返回 */
export const toKcal = (value: number, unit: 'kcal' | 'kj', decimals = 2) =>
  value >= 0 && unit === 'kj' ? kjToKcal(value, decimals) : value

/** 将 kcal 换算为指定单位用于展示 */
export const fromKcal = (kcal: number, unit: 'kcal' | 'kj', decimals = 2) =>
  unit === 'kj' ? kcalToKj(kcal, decimals) : round(kcal, decimals)

/** 解析可选营养输入，空值或非法值返回 -1（表示未填写） */
export const parseNutrientInput = (value: string) => {
  if (value === '' || value === '.') return -1
  const num = parseFloat(value)
  return isNaN(num) ? -1 : round(num, 1)
}

/** 未填写（-1）时归零 */
export const nutrientOrZero = (value: number) => (value >= 0 ? value : 0)

/** 只保留数字与单个小数点 */
export const sanitizeNumberInput = (value: string, allowDecimal = true) => {
  const filtered = (value ?? '').replace(/[^\d.]/g, '')
  if (!allowDecimal) return filtered.replace(/\./g, '')
  const parts = filtered.split('.')
  return parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : filtered
}

/** 按份量与食物基准量的比例换算单个食物的营养素 */
export const scaleFoodNutrition = (food: Food, quantity: number): NutritionTotals => {
  const ratio = quantity / food.num
  return {
    calories: round(food.calorie * ratio),
    protein: round(food.protein_g * ratio),
    carbs: round(food.carbs_g * ratio),
    fat: round(food.fat_g * ratio),
  }
}

/** 汇总套餐内所有食物的营养素 */
export const sumFoodPortions = <T extends FoodPortion>(
  portions: T[],
  quantityOf: (portion: T) => number = (portion) => portion.quantity
): NutritionTotals => {
  const totals = portions.reduce<NutritionTotals>(
    (acc, portion) => {
      const ratio = quantityOf(portion) / portion.food.num
      return {
        calories: acc.calories + portion.food.calorie * ratio,
        protein: acc.protein + portion.food.protein_g * ratio,
        carbs: acc.carbs + portion.food.carbs_g * ratio,
        fat: acc.fat + portion.food.fat_g * ratio,
      }
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
  return {
    calories: round(totals.calories),
    protein: round(totals.protein),
    carbs: round(totals.carbs),
    fat: round(totals.fat),
  }
}

/** 汇总多条饮食记录的营养素，忽略未填写的项 */
export const sumRecordNutrition = (records: Pick<MealRecord, 'calories_total' | 'protein_total' | 'carbs_total' | 'fat_total'>[]): NutritionTotals =>
  records.reduce<NutritionTotals>(
    (acc, record) => ({
      calories: acc.calories + nutrientOrZero(record.calories_total),
      protein: acc.protein + nutrientOrZero(record.protein_total),
      carbs: acc.carbs + nutrientOrZero(record.carbs_total),
      fat: acc.fat + nutrientOrZero(record.fat_total),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
