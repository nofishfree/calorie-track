import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { syncAPI } from '../api'
import type { SyncOperationRequest } from '../types'

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

const hasUsableDataId = (data: unknown): data is Record<string, unknown> => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false
  }
  const id = (data as Record<string, unknown>).id
  return typeof id === 'string' && id.length > 0
}

export const useOperationStore = create<OperationState>()(
  persist(
    (set, get) => ({
      queues: {},
      isSyncing: false,
      pollingTimer: null,

      addOperation: (entity_type, data, operation_type = 'add') => {
        if (!hasUsableDataId(data)) {
          console.error('Cannot enqueue operation without a string data.id', { entity_type, data, operation_type })
          return
        }

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
        if (!hasUsableDataId(data)) {
          console.error('Cannot enqueue delete operation without a string data.id', { entity_type, data })
          return
        }

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
        let clientVersion = user?.data_version || 0

        set({ isSyncing: true })

        try {
          for (let processedCount = 0; processedCount < 20; processedCount += 1) {
            const queue = get().queues[targetUserId] || []
            const head = queue[0]
            const headOperation: SyncOperationRequest | null = head
              ? {
                  id: head.id,
                  operation_type: head.operation_type,
                  entity_type: head.entity_type,
                  data: head.data,
                }
              : null
            const headOperationId = head?.id || null

            const response = await syncAPI.versionedSync({
              client_version: clientVersion,
              head_operation: headOperation,
            })

            // 如果头像哈希值不存在于数据库，需要先上传头像
            if (response.missing_avatar_hash) {
              const { avatarStore } = await import('./avatarStore')
              const avatarHash = response.missing_avatar_hash
              const avatarData = await avatarStore.getAvatar(avatarHash)
              if (avatarData) {
                await avatarStore.syncAvatarToServer(avatarHash, avatarData)
              }
              break
            }

            if (response.head_processed && headOperationId) {
              get().removeOperation(targetUserId, headOperationId)
            } else if (response.head_rejected && headOperationId) {
              console.error('Sync operation rejected', response.head_rejected, headOperation)
              get().removeOperation(targetUserId, headOperationId)
            }

            if (response.server_version > clientVersion) {
              clientVersion = response.server_version
              useAuthStore.getState().updateDataVersion(response.server_version)
            }

            if (response.operations && response.operations.length > 0) {
              const { useFoodStore } = await import('./foodStore')
              const { useRecordStore } = await import('./recordStore')
              const { usePlanStore } = await import('./planStore')
              const { useGoalStore } = await import('./goalStore')

              for (const op of response.operations) {
                if (headOperationId && op.id === headOperationId && response.head_processed) {
                  continue
                }

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

            if (!headOperation || (!response.head_processed && !response.head_rejected)) {
              break
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
      version: 2,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return { queues: {} }
        }

        const persistedQueues = (persistedState as { queues?: unknown }).queues
        if (!persistedQueues || typeof persistedQueues !== 'object') {
          return { queues: {} }
        }

        const queues: Record<string, OperationItem[]> = {}
        for (const [userId, rawQueue] of Object.entries(persistedQueues)) {
          if (!Array.isArray(rawQueue)) {
            continue
          }

          queues[userId] = rawQueue.flatMap((rawOperation) => {
            if (!rawOperation || typeof rawOperation !== 'object') {
              return []
            }

            const operation = rawOperation as Record<string, unknown>
            if (!hasUsableDataId(operation.data)) {
              return []
            }

            return [{
              ...operation,
              id: typeof operation.id === 'string' && operation.id.length > 0
                ? operation.id
                : generateId(),
              data: operation.data,
            } as OperationItem]
          })
        }

        return { queues }
      },
      partialize: (state) => ({
        // 只持久化队列数据，不持久化 timer 和同步状态
        queues: state.queues,
      }),
    }
  )
)
