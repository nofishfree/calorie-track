import axios from 'axios'
import dayjs from 'dayjs'
import { useAuthStore, useGoalStore, useOperationStore } from '../stores'
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
    return api.get<unknown, ServerResponse<ServerMealRecord[]>>('/api/records', { params: { date, limit: 100 } })
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
    entity_id: string
    data: Record<string, unknown>
  }) => {
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
          return api.put(`/api/foods/${operation.entity_id}`, {
            name: food.name,
            num: food.num,
            calorie: food.calorie,
            carbs_g: food.carbs_g,
            protein_g: food.protein_g,
            fat_g: food.fat_g,
            unit: food.unit,
          })
        } else {
          return api.delete(`/api/foods/${operation.entity_id}`)
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
          return api.put(`/api/records/${operation.entity_id}`, {
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
          return api.delete(`/api/records/${operation.entity_id}`)
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
          return api.put(`/api/plans/${operation.entity_id}`, {
            name: plan.name,
            items: items.map(item => ({
              food_id: item.food_id,
              food: item.food,
              quantity: item.quantity,
            })),
          })
        } else {
          return api.delete(`/api/plans/${operation.entity_id}`)
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
            return await api.put(`/api/goal-templates/${operation.entity_id}`, {
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
            // 用服务器返回的真实 UUID 更新本地状态和后续操作的 entity_id
            const newId = response?.data?.id
            if (newId && newId !== operation.entity_id) {
              useGoalStore.getState().updateTemplateId(operation.entity_id, newId)
              useOperationStore.getState().updateEntityId('goal', operation.entity_id, newId)
            }
            return response
          }
        } else {
          // delete：ID 非 UUID（400）或已不存在（404）均视为成功
          try {
            return await api.delete(`/api/goal-templates/${operation.entity_id}`)
          } catch (error: any) {
            const status = error.response?.status
            if (status !== 404 && status !== 400) throw error
          }
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
}

export default api

