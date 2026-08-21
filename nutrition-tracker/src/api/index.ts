import axios from 'axios'
import dayjs from 'dayjs'
import { useAuthStore, useGoalStore } from '../stores'
import type { ServerResponse, ServerFood, ServerMealRecord, ServerGoalTemplate, ServerUserMe, VersionedSyncRequest, VersionedSyncResponse } from '../types'

const api = axios.create({
  baseURL: 'https://track-server.fishfree.fun',
  timeout: 10000,
})

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    if (error.response?.status === 401) {
      const { isLocalAccount } = useAuthStore.getState()
      const currentPath = window.location.pathname
      
      // 只有在非本地账号且不在登录/注册页面时才跳转
      if (!isLocalAccount && currentPath !== '/login' && currentPath !== '/register') {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// 认证相关 API - 保留
export const authAPI = {
  login: (email: string, password: string) => {
    return api.post('/api/auth/login', { email, password })
  },

  register: (email: string, password: string, username?: string) => {
    return api.post('/api/auth/register', { email, password, username })
  },

  forgotPassword: (email: string) => {
    return api.post('/api/auth/forgot-password', { email })
  },

  resetPassword: (email: string, code: string, newPassword: string) => {
    return api.post('/api/auth/reset-password', { email, code, new_password: newPassword })
  },

  changePassword: (oldPassword: string, newPassword: string) => {
    return api.post('/api/auth/change-password', { old_password: oldPassword, new_password: newPassword })
  },
}

// 用户相关 API
export const userAPI = {
  deleteAccount: () => {
    return api.delete('/api/user/me')
  },
  getMe: () => {
    return api.get<unknown, ServerResponse<ServerUserMe>>('/api/user/me')
  },
}

// 记录相关 API
export const recordsAPI = {
  getRecordsByDate: (date: string) => {
    return api.get<unknown, ServerResponse<ServerMealRecord[]>>('/api/records', { params: { date, limit: 100, tz_offset: -new Date().getTimezoneOffset() } })
  },

  getRecordsByDateRange: (startDate: string, endDate: string) => {
    return api.get<unknown, ServerResponse<ServerMealRecord[]>>('/api/records', { params: { date: startDate, end_date: endDate, limit: 500, tz_offset: -new Date().getTimezoneOffset() } })
  },
}

// 食物相关 API
export const foodsAPI = {
  getFoods: () => {
    return api.get<unknown, ServerResponse<ServerFood[]>>('/api/foods', { params: { per_page: 100 } })
  },
}

// 目标模板相关 API
export const goalTemplatesAPI = {
  getAll: () => {
    return api.get<unknown, ServerResponse<ServerGoalTemplate[]>>('/api/goal-templates')
  },
  create: (data: {
    name: string
    type?: 'daily' | 'cycle'
    cycle_days?: number
    today_index?: number
    daily_goals: unknown
    last_active_date?: string | null
  }) => {
    return api.post('/api/goal-templates', data)
  },
  update: (id: string, data: {
    name?: string
    type?: 'daily' | 'cycle'
    cycle_days?: number
    today_index?: number
    daily_goals?: unknown
    is_current?: boolean
    last_active_date?: string | null
  }) => {
    return api.put(`/api/goal-templates/${id}`, data)
  },
  delete: (id: string) => {
    return api.delete(`/api/goal-templates/${id}`)
  },
  setCurrent: (id: string) => {
    return api.put(`/api/goal-templates/${id}/current`)
  },
}

// 系统相关 API
export const systemAPI = {
  healthCheck: () => {
    return api.get('/health', { timeout: 3000 })
  },
}

// 操作队列上传 API
export const syncAPI = {
  uploadOperation: async (operation: {
    operation_type: 'add' | 'update' | 'delete'
    entity_type: 'food' | 'record' | 'plan' | 'goal' | 'account'
    data: Record<string, unknown>
  }) => {
    const dataId = (operation.data as Record<string, unknown>).id as string
    switch (operation.entity_type) {
      case 'food': {
        const food = operation.data as Record<string, unknown>
        if (operation.operation_type === 'add') {
          return api.post('/api/foods', {
            id: food.id,
            name: food.name,
            num: food.num,
            unit: food.unit,
            calorie: food.calorie,
            calorie_unit: food.calorie_unit,
            carbs_g: food.carbs_g,
            protein_g: food.protein_g,
            fat_g: food.fat_g,
          })
        } else if (operation.operation_type === 'update') {
          return api.put(`/api/foods/${dataId}`, {
            name: food.name,
            num: food.num,
            calorie: food.calorie,
            carbs_g: food.carbs_g,
            protein_g: food.protein_g,
            fat_g: food.fat_g,
            unit: food.unit,
          })
        } else {
          return api.delete(`/api/foods/${dataId}`)
        }
      }
      case 'record': {
        const record = operation.data as Record<string, unknown>
        const foodData = record.food as Record<string, unknown> | undefined
        const planItems = record.plan_items as Array<Record<string, unknown>> | undefined
        
        // 修复 record_time 格式：兼容旧数据（不带时区的本地时间字符串）
        const fixRecordTime = (time: string | undefined): string => {
          if (!time) return new Date().toISOString()
          // 如果已经是 ISO 格式（带 Z 或时区偏移），直接返回
          if (time.includes('Z') || time.includes('+') || time.includes('-')) {
            return time
          }
          // 否则视为本地时间，转换为 UTC ISO 格式
          return dayjs(time).toISOString()
        }
        
        const record_time = fixRecordTime(record.record_time as string)
        
        if (operation.operation_type === 'add') {
          return api.post('/api/records', {
            food_id: record.food_id || foodData?.id,
            food: foodData,
            serving_count: record.serving_count,
            record_time,
            calories_total: record.calories_total,
            carbs_total: record.carbs_total,
            protein_total: record.protein_total,
            fat_total: record.fat_total,
            plan_id: record.plan_id,
            plan_name: record.plan_name,
            plan_items: planItems?.map(item => ({
              food_id: item.food_id,
              food: item.food,
              quantity: item.quantity,
            })),
            is_quick_add: record.is_quick_add,
          })
        } else if (operation.operation_type === 'update') {
          return api.put(`/api/records/${dataId}`, {
            food_id: record.food_id || foodData?.id,
            food: foodData,
            serving_count: record.serving_count,
            record_time,
            calories_total: record.calories_total,
            carbs_total: record.carbs_total,
            protein_total: record.protein_total,
            fat_total: record.fat_total,
            plan_id: record.plan_id,
            plan_name: record.plan_name,
            plan_items: planItems?.map(item => ({
              food_id: item.food_id,
              food: item.food,
              quantity: item.quantity,
            })),
            is_quick_add: record.is_quick_add,
          })
        } else {
          return api.delete(`/api/records/${dataId}`)
        }
      }
      case 'plan': {
        const plan = operation.data as Record<string, unknown>
        const items = (plan.items as Array<Record<string, unknown>> | undefined) || []
        if (operation.operation_type === 'add') {
          return api.post('/api/plans', {
            name: plan.name,
            items: items.map(item => ({
              food_id: item.food_id,
              food: item.food,
              quantity: item.quantity,
            })),
          })
        } else if (operation.operation_type === 'update') {
          return api.put(`/api/plans/${dataId}`, {
            name: plan.name,
            items: items.map(item => ({
              food_id: item.food_id,
              food: item.food,
              quantity: item.quantity,
            })),
          })
        } else {
          return api.delete(`/api/plans/${dataId}`)
        }
      }
      case 'goal': {
        const template = operation.data as Record<string, unknown>
        if (operation.operation_type === 'add') {
          return api.post('/api/goal-templates', {
            name: template.name,
            type: template.type,
            cycle_days: template.cycle_days,
            today_index: template.today_index,
            daily_goals: template.daily_goals,
            last_active_date: template.last_active_date,
          })
        } else if (operation.operation_type === 'update') {
          // 尝试 PUT 更新；若 ID 非 UUID（400）或服务器上不存在（404），回退为 POST 创建
          try {
            return await api.put(`/api/goal-templates/${dataId}`, {
              name: template.name,
              type: template.type,
              cycle_days: template.cycle_days,
              today_index: template.today_index,
              daily_goals: template.daily_goals,
              is_current: template.is_current,
              last_active_date: template.last_active_date,
            })
          } catch (error: any) {
            const status = error.response?.status
            if (status !== 404 && status !== 400) throw error
            // 400 = 路径参数 UUID 解析失败（旧版本地短 ID）；404 = 模板不存在
            // 统一回退为 POST 创建
            const response: any = await api.post('/api/goal-templates', {
              name: template.name,
              type: template.type,
              cycle_days: template.cycle_days,
              today_index: template.today_index,
              daily_goals: template.daily_goals,
              last_active_date: template.last_active_date,
            })
            // 用服务器返回的真实 UUID 更新本地状态
            const newId = response?.data?.id
            if (newId && newId !== dataId) {
              useGoalStore.getState().updateTemplateId(dataId, newId)
            }
            return response
          }
        } else {
          // delete：ID 非 UUID（400）或已不存在（404）均视为成功
          try {
            return await api.delete(`/api/goal-templates/${dataId}`)
          } catch (error: any) {
            const status = error.response?.status
            if (status !== 404 && status !== 400) throw error
          }
          return
        }
      }
      case 'account':
        return api.put('/api/user/me', {
          username: operation.data.username,
          avatar: operation.data.avatar,
        })
      default:
        return Promise.reject(new Error('Unknown entity type'))
    }
  },

  // 版本化同步 API
  versionedSync: async (request: VersionedSyncRequest): Promise<VersionedSyncResponse> => {
    const response = await api.post<unknown, ServerResponse<VersionedSyncResponse>>('/api/sync/versioned', request)
    return response.data
  },

  // 头像相关 API
  getAvatar: async (hash: string) => {
    return api.get<unknown, ServerResponse<{ id: string; hash: string; data: string }>>(`/api/avatars/${hash}`)
  },

  uploadAvatar: async (data: { hash: string; data: string }) => {
    return api.post<unknown, ServerResponse<{ hash: string; success: boolean }>>('/api/avatars', data)
  },

  checkAvatar: async (hash: string) => {
    return api.get<unknown, ServerResponse<{ exists: boolean; hash?: string }>>(`/api/avatars/check/${hash}`)
  },
}

export default api

// 数据初始化工具 - 登录后加载所有必要数据
export const initUserData = async (userId: string) => {
  const { useFoodStore, useRecordStore, useGoalStore } = await import('../stores')
  const { formatDate } = await import('../utils/helpers')
  const dayjs = (await import('dayjs')).default

  try {
    // 1. 加载食物库
    const foodsRes = await foodsAPI.getFoods()
    const serverFoods = foodsRes.data || []
    const mappedFoods = serverFoods.map(f => ({
      ...f,
      calorie_unit: f.calorie_unit as 'kcal' | 'kj',
      user_id: f.user_id ?? undefined,
    }))
    useFoodStore.getState().setFoods(mappedFoods)

    // 2. 加载最近7天的记录
    const recordsByDate = useRecordStore.getState()
    const allRecords: any[] = []
    const failedDates: string[] = []

    // 逐天获取记录（简单可靠）
    for (let i = 6; i >= 0; i--) {
      const date = formatDate(dayjs().subtract(i, 'day').toDate())
      try {
        const res = await recordsAPI.getRecordsByDate(date)
        const records = res.data || []
        const mappedRecords = records.map((r: any) => ({
          ...r,
          user_id: userId,
          food: {
            ...r.food,
            user_id: r.food?.user_id ?? undefined,
          },
        }))
        allRecords.push(...mappedRecords)
        recordsByDate.setRecordsForDate(date, mappedRecords)
      } catch (e) {
        console.error(`Failed to fetch records for ${date}:`, e)
        failedDates.push(date)
      }
    }

    // 3. 加载目标模板
    const goalsRes = await goalTemplatesAPI.getAll()
    const serverTemplates = goalsRes.data || []
    if (serverTemplates.length > 0) {
      const templates = serverTemplates.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        cycle_days: t.cycle_days,
        today_index: t.today_index,
        daily_goals: t.daily_goals,
        is_current: t.is_current,
        last_active_date: t.last_active_date || undefined,
      }))
      const currentTemplate = templates.find(t => t.is_current) || templates[0]
      useGoalStore.getState().syncTemplates(templates, currentTemplate.id)
    }

    // 部分日期加载失败时也视为初始化不完整，调用方会提示用户
    return {
      success: failedDates.length === 0,
      foods: mappedFoods,
      records: allRecords,
      failedDates,
    }
  } catch (error) {
    console.error('Failed to initialize user data:', error)
    return { success: false, error }
  }
}

