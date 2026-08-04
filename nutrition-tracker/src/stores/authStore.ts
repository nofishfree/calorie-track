import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  username?: string
  avatar?: string
  is_admin?: boolean
  data_version?: number
}

interface SavedAccount {
  token: string
  user: User
}

const LOCAL_ACCOUNT_ID = 'local-account'
const LOCAL_ACCOUNT: User = {
  id: LOCAL_ACCOUNT_ID,
  email: '本地账号',
  username: '本地账号',
  data_version: 0,
}

interface AuthState {
  user: User | null
  token: string | null
  isLoggedIn: boolean
  isLocalAccount: boolean
  savedAccounts: SavedAccount[]
  currentAccountId: string | null
  login: (token: string, user: User) => void
  logout: () => void
  switchToLocalAccount: () => void
  updateUser: (user: Partial<User>) => void
  updateDataVersion: (version: number) => void
  addSavedAccount: (token: string, user: User) => void
  removeSavedAccount: (userId: string) => void
  getSavedAccounts: () => SavedAccount[]
  switchToAccount: (userId: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: LOCAL_ACCOUNT,
      token: null,
      isLoggedIn: false,
      isLocalAccount: true,
      savedAccounts: [],
      currentAccountId: LOCAL_ACCOUNT_ID,

      login: (token, user) => {
        set({
          token,
          user,
          isLoggedIn: true,
          isLocalAccount: false,
        })
        const { savedAccounts } = get()
        const existingIndex = savedAccounts.findIndex(a => a.user.id === user.id)
        if (existingIndex === -1) {
          set({
            savedAccounts: [...savedAccounts, { token, user }],
            currentAccountId: user.id,
          })
        } else {
          const updated = [...savedAccounts]
          updated[existingIndex] = { token, user }
          set({ savedAccounts: updated, currentAccountId: user.id })
        }
      },

      logout: () => {
        const { currentAccountId, isLocalAccount, savedAccounts } = get()
        const accountId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)

        // 停止轮询同步 + 清除所有缓存数据
        Promise.resolve().then(async () => {
          try {
            const { useOperationStore } = await import('./operationStore')
            const { useFoodStore } = await import('./foodStore')
            const { useRecordStore } = await import('./recordStore')
            const { usePlanStore } = await import('./planStore')
            const { useGoalStore } = await import('./goalStore')
            const { clearUserData } = await import('../db/db')

            // 清除内存数据（仅清除当前账号的数据，保留其他账号）
            useFoodStore.getState().clearFoodsForAccount(accountId)
            useRecordStore.getState().clearRecordsForAccount(accountId)
            usePlanStore.getState().clearPlansForAccount(accountId)
            useOperationStore.getState().clearQueue()

            // 清除目标模板
            useGoalStore.setState((state) => ({
              templates: {
                ...state.templates,
                [accountId]: [],
              },
              currentTemplateId: {
                ...state.currentTemplateId,
                [accountId]: '',
              },
            }))

            // 清除 IndexedDB 缓存
            if (accountId !== LOCAL_ACCOUNT_ID) {
              await clearUserData(accountId)
            }

            useOperationStore.getState().stopPolling()
          } catch (e) {
            console.error('[logout] Failed to clear cache:', e)
          }
        })

        if (currentAccountId && currentAccountId !== LOCAL_ACCOUNT_ID) {
          const updatedAccounts = savedAccounts.filter(a => a.user.id !== currentAccountId)
          set({
            token: null,
            user: LOCAL_ACCOUNT,
            isLoggedIn: false,
            isLocalAccount: true,
            currentAccountId: LOCAL_ACCOUNT_ID,
            savedAccounts: updatedAccounts,
          })
        } else {
          set({
            token: null,
            user: LOCAL_ACCOUNT,
            isLoggedIn: false,
            isLocalAccount: true,
            currentAccountId: LOCAL_ACCOUNT_ID,
          })
        }
      },

      switchToLocalAccount: () => {
        set({
          token: null,
          user: LOCAL_ACCOUNT,
          isLoggedIn: false,
          isLocalAccount: true,
          currentAccountId: LOCAL_ACCOUNT_ID,
        })
      },

      updateUser: (user) => {
        const current = get().user
        if (current) {
          set({
            user: { ...current, ...user },
          })
        }
      },

      updateDataVersion: (version) => {
        const current = get().user
        if (current) {
          set({
            user: { ...current, data_version: version },
          })
          // 同时更新保存的账号
          const { savedAccounts, currentAccountId } = get()
          if (currentAccountId && currentAccountId !== LOCAL_ACCOUNT_ID) {
            const updatedAccounts = savedAccounts.map(a =>
              a.user.id === currentAccountId
                ? { ...a, user: { ...a.user, data_version: version } }
                : a
            )
            set({ savedAccounts: updatedAccounts })
          }
        }
      },

      addSavedAccount: (token, user) => {
        const { savedAccounts } = get()
        const existingIndex = savedAccounts.findIndex(a => a.user.id === user.id)
        if (existingIndex === -1) {
          set({
            savedAccounts: [...savedAccounts, { token, user }],
          })
        } else {
          const updated = [...savedAccounts]
          updated[existingIndex] = { token, user }
          set({ savedAccounts: updated })
        }
      },

      removeSavedAccount: (userId) => {
        const { savedAccounts, currentAccountId } = get()
        const filtered = savedAccounts.filter(a => a.user.id !== userId)
        set({ savedAccounts: filtered })
        if (currentAccountId === userId) {
          set({
            token: null,
            user: LOCAL_ACCOUNT,
            isLoggedIn: false,
            isLocalAccount: true,
            currentAccountId: LOCAL_ACCOUNT_ID,
          })
        }
      },

      getSavedAccounts: () => {
        return get().savedAccounts
      },

      switchToAccount: (userId) => {
        if (userId === LOCAL_ACCOUNT_ID) {
          get().switchToLocalAccount()
          return
        }
        const { savedAccounts } = get()
        const account = savedAccounts.find(a => a.user.id === userId)
        if (account) {
          set({
            token: account.token,
            user: account.user,
            isLoggedIn: true,
            isLocalAccount: false,
            currentAccountId: userId,
          })
        }
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)

