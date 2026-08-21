import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'
import { syncAPI } from '../api'

vi.mock('../api', () => ({
  syncAPI: {
    versionedSync: vi.fn(),
  },
}))

const account = { id: 'user-1', email: 'user@example.com', data_version: 2 }

function resetStores() {
  useAuthStore.setState({
    user: { id: 'local-account', email: '本地账号', username: '本地账号', data_version: 0 },
    token: null,
    isLoggedIn: false,
    isLocalAccount: true,
    savedAccounts: [],
    currentAccountId: 'local-account',
  })
  useOperationStore.setState({ queues: {}, isSyncing: false, pollingTimer: null })
}

describe('operation queue', () => {
  beforeEach(() => {
    resetStores()
    vi.mocked(syncAPI.versionedSync).mockReset()
  })

  it('keys queues by local and logged-in accounts and supports queue mutations', () => {
    useOperationStore.getState().addOperation('food', { id: 'local-food' })
    useOperationStore.getState().deleteOperation('record', { id: 'local-record' })
    expect(useOperationStore.getState().getQueue()).toHaveLength(2)
    expect(useOperationStore.getState().getQueue()[1].operation_type).toBe('delete')

    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
    useOperationStore.getState().addOperation('goal', { id: 'goal-1' }, 'update')
    expect(useOperationStore.getState().getQueue()).toHaveLength(1)
    expect(useOperationStore.getState().getQueue('local-account')).toHaveLength(2)

    const operationId = useOperationStore.getState().getQueue()[0].id
    useOperationStore.getState().removeOperation(account.id, operationId)
    expect(useOperationStore.getState().getQueue(account.id)).toEqual([])
    useOperationStore.getState().clearQueue('local-account')
    expect(useOperationStore.getState().getQueue('local-account')).toEqual([])
  })

  it('does not poll local accounts, avoids double starts, and stops its timer', () => {
    vi.useFakeTimers()
    useOperationStore.getState().startPolling()
    expect(useOperationStore.getState().pollingTimer).toBeNull()

    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
    useOperationStore.getState().startPolling()
    const timer = useOperationStore.getState().pollingTimer
    expect(timer).not.toBeNull()
    useOperationStore.getState().startPolling()
    expect(useOperationStore.getState().pollingTimer).toBe(timer)
    useOperationStore.getState().stopPolling()
    expect(useOperationStore.getState().pollingTimer).toBeNull()
  })
})

describe('operation sync', () => {
  beforeEach(() => {
    resetStores()
    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
  })

  it('sends the head operation, removes only a processed head, and updates the version', async () => {
    useOperationStore.getState().addOperation('food', { id: 'food-1' })
    const head = useOperationStore.getState().getQueue()[0]
    vi.mocked(syncAPI.versionedSync).mockResolvedValue({
      server_version: 5,
      operations: [],
      head_processed: true,
    })

    await useOperationStore.getState().performSync()

    expect(syncAPI.versionedSync).toHaveBeenCalledWith({
      client_version: 2,
      head_operation: {
        id: head.id,
        operation_type: 'add',
        entity_type: 'food',
        data: { id: 'food-1' },
      },
    })
    expect(useOperationStore.getState().getQueue()).toEqual([])
    expect(useAuthStore.getState().user?.data_version).toBe(5)
    expect(useOperationStore.getState().isSyncing).toBe(false)
  })

  it('guards local, missing-account, and re-entrant syncs', async () => {
    useAuthStore.setState({ isLocalAccount: true, currentAccountId: 'local-account' })
    await useOperationStore.getState().performSync()
    expect(syncAPI.versionedSync).not.toHaveBeenCalled()

    useAuthStore.setState({ isLocalAccount: false, currentAccountId: null })
    await useOperationStore.getState().performSync()
    expect(syncAPI.versionedSync).not.toHaveBeenCalled()

    useAuthStore.setState({ isLocalAccount: false, currentAccountId: account.id, user: account })
    useOperationStore.setState({ isSyncing: true })
    await useOperationStore.getState().performSync()
    expect(syncAPI.versionedSync).not.toHaveBeenCalled()
  })

  it('dispatches remote operations and keeps an unprocessed head queued', async () => {
    const food = await import('./foodStore')
    const foodSpy = vi.spyOn(food.useFoodStore.getState(), 'applyRemoteOperation')
    useOperationStore.getState().addOperation('food', { id: 'queued' })
    vi.mocked(syncAPI.versionedSync).mockResolvedValue({
      server_version: 2,
      head_processed: false,
      operations: [{
        id: 'remote-food',
        user_id: account.id,
        serial_number: 3,
        operation_type: 'add',
        entity_type: 'food',
        data: { id: 'remote-food', name: 'Rice' },
        created_at: new Date().toISOString(),
      }],
    })

    await useOperationStore.getState().performSync()

    expect(foodSpy).toHaveBeenCalledWith('add', { id: 'remote-food', name: 'Rice' })
    expect(useOperationStore.getState().getQueue()).toHaveLength(1)
    expect(useOperationStore.getState().isSyncing).toBe(false)
  })

  it('uploads a missing avatar and leaves the queue for retry', async () => {
    const avatar = await import('./avatarStore')
    const getAvatar = vi.spyOn(avatar.avatarStore, 'getAvatar').mockResolvedValue('base64-data')
    const upload = vi.spyOn(avatar.avatarStore, 'syncAvatarToServer').mockResolvedValue(undefined)
    useOperationStore.getState().addOperation('account', { avatar: 'hash-1' })
    vi.mocked(syncAPI.versionedSync).mockResolvedValue({
      server_version: 2,
      operations: [],
      head_processed: false,
      missing_avatar_hash: 'hash-1',
    })

    await useOperationStore.getState().performSync()

    expect(getAvatar).toHaveBeenCalledWith('hash-1')
    expect(upload).toHaveBeenCalledWith('hash-1', 'base64-data')
    expect(useOperationStore.getState().getQueue()).toHaveLength(1)
  })
})
