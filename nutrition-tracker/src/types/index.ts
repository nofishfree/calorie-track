export interface Food {
  id: string
  name: string
  num: number
  calorie: number
  calorie_unit: 'kcal' | 'kj'
  carbs_g: number
  protein_g: number
  fat_g: number
  unit: string
  user_id?: string
}

export interface MealRecord {
  id: string
  user_id: string
  food: Food
  serving_count: number
  record_time: string
  calories_total: number
  carbs_total: number
  protein_total: number
  fat_total: number
  plan_id?: string
  plan_name?: string
  plan_items?: Array<{
    food_id: string
    food: Food
    quantity: number
  }>
  is_quick_add?: boolean
}

export interface DailyGoal {
  calorie_target: number | string
  carb_target_g: number | string
  protein_target_g: number | string
  fat_target_g: number | string
}

export interface UserGoals {
  cycle_days: number
  today_index: number
  daily_goals: DailyGoal[]
  calorie_target: number
  carb_target_g: number
  protein_target_g: number
  fat_target_g: number
}

export interface StoredUserGoals {
  cycle_days: number
  today_index: number
  daily_goals: DailyGoal[]
  last_active_date?: string
}

export interface GoalTemplate {
  id: string
  name: string
  type: 'daily' | 'cycle'
  cycle_days?: number
  today_index?: number
  daily_goals?: DailyGoal[]
  is_current?: boolean
  last_active_date?: string
}

export interface UserPreferences {
  theme: ThemeMode
  dietary_preference?: string
  language: string
}

export interface User {
  id: string
  email: string
  username?: string
  avatar?: string
  data_version?: number
}

export type ThemeMode = 'system' | 'light' | 'dark'

export type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat'

export interface NutrientInfo {
  key: NutrientKey
  name: string
  unit: string
  color: string
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}

export interface DailyStats {
  date: string
  total_calories: number
  total_carbs: number
  total_protein: number
  total_fat: number
}

// 套餐相关类型
export interface PlanItem {
  id: string
  food_id: string
  food: Food
  quantity: number
  sort_order: number
}

export interface MealPlan {
  id: string
  user_id: string
  name: string
  item_count: number
  total_calories: number
  total_protein: number
  total_fat: number
  total_carbs: number
  created_at: string
  updated_at: string
}

export interface MealPlanDetail extends MealPlan {
  items: PlanItem[]
}

// ============ 服务器响应类型 ============

/** 服务器统一响应包装（后端 ApiResponse<T> 只有 data 字段） */
export interface ServerResponse<T> {
  data: T
}

/** 后端 FoodResponse 结构 */
export interface ServerFood {
  id: string
  user_id: string | null
  name: string
  num: number
  calorie: number
  calorie_unit: string
  carbs_g: number
  protein_g: number
  fat_g: number
  unit: string
  usage_count?: number | null
}

/** 后端 MealRecordResponse 结构 */
export interface ServerMealRecord {
  id: string
  food_id?: string | null
  food: ServerFood
  serving_count: number
  record_time: string
  calories_total: number
  carbs_total: number
  protein_total: number
  fat_total: number
  plan_id?: string | null
  plan_name?: string
  plan_items?: any[]
  is_quick_add?: boolean
}

/** 后端 GoalTemplate 结构 */
export interface ServerGoalTemplate {
  id: string
  user_id: string
  name: string
  type: 'daily' | 'cycle'
  cycle_days: number
  today_index: number
  daily_goals: DailyGoal[]
  is_current: boolean
  last_active_date: string | null
  created_at: string
  updated_at: string
}

/** 后端 UserMeResponse 结构 */
export interface ServerUserMe {
  id: string
  email: string
  username: string | null
  avatar: string | null
  data_version: number
}

/** 后端版本化同步请求结构 */
export interface VersionedSyncRequest {
  client_version: number
  head_operation?: SyncOperationRequest | null
}

/** 后端同步操作请求结构 */
export interface SyncOperationRequest {
  operation_type: string
  entity_type: string
  entity_id: string
  data: Record<string, unknown>
}

/** 后端操作日志结构 */
export interface OperationLog {
  id: string
  user_id: string
  serial_number: number
  operation_type: string
  entity_type: string
  entity_id: string
  data: Record<string, unknown>
  created_at: string
}

/** 后端版本化同步响应结构 */
export interface VersionedSyncResponse {
  server_version: number
  operations: OperationLog[]
  head_processed: boolean
}


