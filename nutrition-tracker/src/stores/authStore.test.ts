import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './authStore'
import { account, resetStores } from './testHelpers'

describe('authStore account management', () => {
  beforeEach(resetStores)

  it('logs in, updates saved accounts, switches accounts, and handles local account', () => {
    const second = { id: 'user-2', email: 'two@example.com', username: 'Two', data_version: 1 }
    useAuthStore.getState().login('token-1', account)
    expect(useAuthStore.getState()).toMatchObject({ isLoggedIn: true, isLocalAccount: false, currentAccountId: 'user-1' })
    expect(JSON.parse(localStorage.getItem('auth-storage')!).state.token).toBe('token-1')
    useAuthStore.getState().addSavedAccount('token-2', second)
    useAuthStore.getState().addSavedAccount('token-1b', { ...account, username: 'Updated' })
    expect(useAuthStore.getState().savedAccounts).toHaveLength(2)
    expect(useAuthStore.getState().savedAccounts.find(item => item.user.id === account.id)).toMatchObject({ token: 'token-1b', user: { username: 'Updated' } })

    useAuthStore.getState().switchToAccount('missing-account')
    expect(useAuthStore.getState().currentAccountId).toBe(account.id)
    useAuthStore.getState().switchToAccount(second.id)
    expect(useAuthStore.getState()).toMatchObject({ currentAccountId: second.id, token: 'token-2', isLocalAccount: false })
    useAuthStore.getState().updateUser({ username: 'Changed' })
    useAuthStore.getState().updateDataVersion(8)
    expect(useAuthStore.getState().user).toMatchObject({ username: 'Changed', data_version: 8 })
    expect(useAuthStore.getState().savedAccounts.find(item => item.user.id === second.id)?.user.data_version).toBe(8)

    useAuthStore.getState().switchToLocalAccount()
    expect(useAuthStore.getState()).toMatchObject({ currentAccountId: 'local-account', isLocalAccount: true, token: null })
    useAuthStore.getState().removeSavedAccount(account.id)
    expect(useAuthStore.getState().getSavedAccounts().map(item => item.user.id)).toEqual([second.id])
  })

  it('logs out to the local account and removes the active saved account', () => {
    useAuthStore.getState().login('token-1', account)
    useAuthStore.getState().logout()
    expect(useAuthStore.getState()).toMatchObject({
      user: { id: 'local-account' },
      token: null,
      isLoggedIn: false,
      isLocalAccount: true,
      currentAccountId: 'local-account',
    })
    expect(useAuthStore.getState().savedAccounts).toEqual([])
  })
})
