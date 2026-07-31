import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { syncAPI } from '../api'
import type { VersionedSyncRequest, VersionedSyncResponse, SyncOperationRequest, OperationLog } from '../types'

const LOCAL_ACCOUNT_ID = 'local-account'

export type OperationType = 'add' | 'update' | 'delete'
export type EntityType = 'food' | 'record' | 'plan' | 'goal' | 'account'

export interface OperationItem {
  id: string
  operation_type: OperationType
  entity_type: EntityType
  entity_id: string
  data: any
  created_at: string
}

interface OperationState {
  queues: Record<string, OperationItem[]>
  isSyncing: boolean
  pollingTimer: ReturnType<typeof setInterval> | null
  addOperation: (entity_type: EntityType, entity_id: string, data: any, operation_type?: OperationType) => void
  deleteOperation: (entity_type: EntityType, entity_id: string, data?: any) => void
  getQueue: (userId?: string) => OperationItem[]
  clearQueue: (userId?: string) => void
  removeOperation: (userId: string, operationId: string) => void
  startPolling: () => void
  stopPolling: () => void
  performSync: () => Promise<void>
  updateEntityId: (entityType: EntityType, oldId: string, newId: string, userId?: string) => void
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36)

export const useOperationStore = create<OperationState>()(
  persist(
    (set, get) => ({
      queues: {},
      isSyncing: false,
      pollingTimer: null,

      addOperation: (entity_type, entity_id, data, operation_type = 'add') => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)

        const newOperation: OperationItem = {
          id: generateId(),
          operation_type,
          entity_type,
          entity_id,
          data,
          created_at: new Date().toISOString(),
        }

        set((state) => {
          const currentQueue = state.queues[userId] || []
          return {
            queues: {
              ...state.queues,
              [userId]: [...currentQueue, newOperation],
            },
          }
        })
      },

      deleteOperation: (entity_type, entity_id, data = {}) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)

        const newOperation: OperationItem = {
          id: generateId(),
          operation_type: 'delete',
          entity_type,
          entity_id,
          data,
          created_at: new Date().toISOString(),
        }

        set((state) => {
          const currentQueue = state.queues[userId] || []
          return {
            queues: {
              ...state.queues,
              [userId]: [...currentQueue, newOperation],
            },
          }
        })
      },

      getQueue: (userId) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID))
        return get().queues[targetUserId] || []
      },

      clearQueue: (userId) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID))
        set((state) => ({
          queues: {
            ...state.queues,
            [targetUserId]: [],
          },
        }))
      },

      removeOperation: (userId, operationId) => {
        set((state) => ({
          queues: {
            ...state.queues,
            [userId]: (state.queues[userId] || []).filter((op) => op.id !== operationId),
          },
        }))
      },

      startPolling: () => {
        // 避免重复启动
        if (get().pollingTimer) {
          return
        }

        const timer = setInterval(() => {
          const { isLoggedIn, isLocalAccount } = useAuthStore.getState()
          // 仅在已登录且非本地账号时轮询
          if (isLoggedIn && !isLocalAccount) {
            get().performSync().catch(err => {
              console.error('Polling sync error:', err)
            })
          }
        }, 1000) // 每秒轮询

        set({ pollingTimer: timer })
      },

      stopPolling: () => {
        const { pollingTimer } = get()
        if (pollingTimer) {
          clearInterval(pollingTimer)
          set({ pollingTimer: null })
        }
      },

      performSync: async () => {
        if (get().isSyncing) return

        const { currentAccountId, isLocalAccount, user } = useAuthStore.getState()
        if (isLocalAccount || !currentAccountId) return

        const targetUserId = currentAccountId
        const clientVersion = user?.data_version || 0

        // 获取队头操作
        const queue = get().queues[targetUserId] || []
        let headOperation: SyncOperationRequest | null = null
        let headOperationId: string | null = null

        if (queue.length > 0) {
          const head = queue[0]
          headOperation = {
            operation_type: head.operation_type,
            entity_type: head.entity_type,
            entity_id: head.entity_id,
            data: head.data,
          }
          headOperationId = head.id
        }

        set({ isSyncing: true })

        try {
          const request: VersionedSyncRequest = {
            client_version: clientVersion,
            head_operation: headOperation,
          }

          const response = await syncAPI.versionedSync(request)

          // 处理队头操作结果
          if (response.head_processed && headOperationId) {
            get().removeOperation(targetUserId, headOperationId)
          }

          // 更新数据版本
          if (response.server_version > clientVersion) {
            useAuthStore.getState().updateDataVersion(response.server_version)
          }

          // 处理增量同步数据
          if (response.operations && response.operations.length > 0) {
            const currentQueue = get().queues[targetUserId] || []
            const headEntityId = currentQueue.length > 0 ? currentQueue[0].entity_id : null

            for (const op of response.operations) {
              // 如果是队头操作，跳过同步（已上传）
              if (headEntityId && op.entity_id === headEntityId && response.head_processed) {
                continue
              }
              // 其他操作需要应用到本地
              // 注意：这里只更新 data_version，实际数据同步由具体实体的 API 处理
              // 因为我们使用的是独立的实体 API（如 foodsAPI、recordsAPI）
              // 所以服务器返回的操作日志主要用于版本控制
            }
          }
        } catch (error) {
          console.error('Versioned sync error:', error)
        } finally {
          set({ isSyncing: false })
        }
      },

      updateEntityId: (entityType, oldId, newId, userId) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID))

        set((state) => {
          const currentQueue = state.queues[targetUserId] || []
          return {
            queues: {
              ...state.queues,
              [targetUserId]: currentQueue.map(op =>
                op.entity_type === entityType && op.entity_id === oldId
                  ? { ...op, entity_id: newId }
                  : op
              ),
            },
          }
        })
      },
    }),
    {
      name: 'operation-queue-storage',
    }
  )
)
