import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { avatarStore, computeHash } from './avatarStore'
import { account, resetStores } from './testHelpers'

const apiMocks = vi.hoisted(() => ({
  checkAvatar: vi.fn(),
  uploadAvatar: vi.fn(),
  getAvatar: vi.fn(),
}))

vi.mock('../api', () => ({ syncAPI: apiMocks }))

describe('avatar hashing and cache/sync behavior', () => {
  beforeEach(() => {
    resetStores()
    vi.restoreAllMocks()
    apiMocks.checkAvatar.mockReset()
    apiMocks.uploadAvatar.mockReset()
    apiMocks.getAvatar.mockReset()
  })

  it('computes a stable SHA-256 hash and skips server sync for local accounts', async () => {
    expect(await computeHash('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    await avatarStore.syncAvatarToServer('hash-1', 'data')
    expect(apiMocks.checkAvatar).not.toHaveBeenCalled()
    expect(apiMocks.uploadAvatar).not.toHaveBeenCalled()
  })

  it('checks the server, uploads missing avatars, and deduplicates concurrent syncs', async () => {
    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
    apiMocks.checkAvatar.mockResolvedValue({ data: { exists: false } })
    apiMocks.uploadAvatar.mockResolvedValue({ data: { success: true } })
    await avatarStore.syncAvatarToServer('hash-1', 'data')
    expect(apiMocks.checkAvatar).toHaveBeenCalledWith('hash-1')
    expect(apiMocks.uploadAvatar).toHaveBeenCalledWith({ hash: 'hash-1', data: 'data' })

    let release!: () => void
    apiMocks.checkAvatar.mockImplementation(() => new Promise(resolve => { release = () => resolve({ data: { exists: true } }) }))
    const first = avatarStore.syncAvatarToServer('hash-2', 'data')
    const second = avatarStore.syncAvatarToServer('hash-2', 'data')
    await Promise.resolve()
    expect(apiMocks.checkAvatar).toHaveBeenCalledTimes(2)
    release()
    await Promise.all([first, second])
    expect(apiMocks.uploadAvatar).toHaveBeenCalledTimes(1)
  })

  it('reads and writes the local avatar cache and fetches missing data remotely', async () => {
    const syncSpy = vi.spyOn(avatarStore, 'syncAvatarToServer').mockResolvedValue(undefined)
    await avatarStore.saveAvatar('hash-1', 'local-data')
    expect(await avatarStore.hasAvatar('hash-1')).toBe(true)
    expect(await avatarStore.getAvatar('hash-1')).toBe('local-data')
    expect(syncSpy).toHaveBeenCalledWith('hash-1', 'local-data')
    await avatarStore.deleteAvatar('hash-1')
    expect(await avatarStore.getAvatar('hash-1')).toBeNull()

    apiMocks.checkAvatar.mockResolvedValue({ data: { exists: true } })
    apiMocks.getAvatar.mockResolvedValue({ data: { data: 'remote-data' } })
    const saveSpy = vi.spyOn(avatarStore, 'saveAvatar').mockResolvedValue(undefined)
    expect(await avatarStore.getOrFetchAvatar('missing')).toBe('remote-data')
    expect(saveSpy).toHaveBeenCalledWith('missing', 'remote-data')
  })
})
