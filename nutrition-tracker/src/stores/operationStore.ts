import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { syncAPI } from '../api'
import type { VersionedSyncRequest, SyncOperationRequest } from '../types'

const LOCAL_ACCOUNT_ID = 'local-account'

export type OperationType = 'add' | 'update' | 'delete'
export type EntityType = 'food' | 'record' | 'plan' | 'goal' | 'account'

export interface OperationItem {
  id: string
  operation_type: OperationType
  entity_type: EntityType
  data: any
  created_at: string
}

interface OperationState {
  queues: Record<string, OperationItem[]>
  isSyncing: boolean
  pollingTimer: ReturnType<typeof setInterval> | null
  addOperation: (entity_type: EntityType, data: any, operation_type?: OperationType) => void
  deleteOperation: (entity_type: EntityType, data: any) => void
  getQueue: (userId?: string) => OperationItem[]
  clearQueue: (userId?: string) => void
  removeOperation: (userId: string, operationId: string) => void
  startPolling: () => void
  stopPolling: () => void
  performSync: () => Promise<void>
}

const generateId = (): string => crypto.randomUUID()

export const useOperationStore = create<OperationState>()(
  persist(
    (set, get) => ({
      queues: {},
      isSyncing: false,
      pollingTimer: null,

      addOperation: (entity_type, data, operation_type = 'add') => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)

        const newOperation: OperationItem = {
          id: generateId(),
          operation_type,
          entity_type,
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

      deleteOperation: (entity_type, data) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)

        const newOperation: OperationItem = {
          id: generateId(),
          operation_type: 'delete',
          entity_type,
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

        // 仅在已登录且非本地账号时启动
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        if (isLocalAccount || !currentAccountId || currentAccountId === LOCAL_ACCOUNT_ID) {
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
            id: head.id,
            operation_type: head.operation_type,
            entity_type: head.entity_type,
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

          // 如果头像哈希值不存在于数据库，需要先上传头像
          if (response.missing_avatar_hash) {
            const { avatarStore } = await import('./avatarStore')
            const avatarHash = response.missing_avatar_hash
            const avatarData = await avatarStore.getAvatar(avatarHash)
            if (avatarData) {
              // 上传头像到服务器
              const success = await avatarStore.uploadAvatarToServer(avatarHash, avatarData)
              if (!success) {
                console.error('Failed to upload avatar:', avatarHash)
              }
              // 无论上传成功与否，都让下次轮询重试（不删除操作）
            }
            // 不处理操作，等待下次轮询重试
            set({ isSyncing: false })
            return
          }

          // 仅当后端确认操作已记录在日志中时，才从队列中移除
          if (response.head_processed && headOperationId) {
            get().removeOperation(targetUserId, headOperationId)
          }

          // 更新数据版本
          if (response.server_version > clientVersion) {
            useAuthStore.getState().updateDataVersion(response.server_version)
          }

          // 处理增量同步数据：将服务器返回的操作应用到本地 store
          if (response.operations && response.operations.length > 0) {
            // 动态导入各 store（避免循环依赖）
            const { useFoodStore } = await import('./foodStore')
            const { useRecordStore } = await import('./recordStore')
            const { usePlanStore } = await import('./planStore')
            const { useGoalStore } = await import('./goalStore')

            for (const op of response.operations) {
              // 如果是队头操作且已处理，跳过（避免重复应用，基于操作 ID 判断）
              if (headOperationId && op.id === headOperationId && response.head_processed) {
                continue
              }

              // 根据实体类型分发到对应的 store
              const data = op.data as Record<string, unknown>
              switch (op.entity_type) {
                case 'food':
                  useFoodStore.getState().applyRemoteOperation(op.operation_type, data)
                  break
                case 'record':
                  useRecordStore.getState().applyRemoteOperation(op.operation_type, data)
                  break
                case 'plan':
                  usePlanStore.getState().applyRemoteOperation(op.operation_type, data)
                  break
                case 'goal':
                  useGoalStore.getState().applyRemoteOperation(op.operation_type, data)
                  break
                case 'account':
                  if (op.operation_type === 'update') {
                    useAuthStore.getState().updateUser({
                      username: data.username as string | undefined,
                      avatar: data.avatar as string | undefined,
                    })
                  }
                  break
              }
            }
          }
        } catch (error) {
          console.error('Versioned sync error:', error)
        } finally {
          set({ isSyncing: false })
        }
      },
    }),
    {
      name: 'operation-queue-storage',
      partialize: (state) => ({
        // 只持久化队列数据，不持久化 timer 和同步状态
        queues: state.queues,
      }),
    }
  )
)
