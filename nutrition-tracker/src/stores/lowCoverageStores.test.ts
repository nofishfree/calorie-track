import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food, MealRecord } from '../types'
import { useAuthStore } from './authStore'
import { avatarStore, computeHash } from './avatarStore'
import { useFoodStore } from './foodStore'
import { useOperationStore } from './operationStore'
import { usePlanStore, localPlanToApiFormat } from './planStore'
import { useRecordStore } from './recordStore'

const apiMocks = vi.hoisted(() => ({
  checkAvatar: vi.fn(),
  uploadAvatar: vi.fn(),
  getAvatar: vi.fn(),
  versionedSync: vi.fn(),
}))

const dbRecordMocks = vi.hoisted(() => ({
  addRecord: vi.fn(),
}))

vi.mock('../api', () => ({ syncAPI: apiMocks }))
vi.mock('../db/recordStore', () => dbRecordMocks)

const account = {
  id: 'user-1',
  email: 'user@example.com',
  data_version: 2,
}

const food = (id: string, user_id?: string): Food => ({
  id,
  name: id === 'food-1' ? 'Oats' : 'Rice',
  num: 100,
  calorie: 200,
  calorie_unit: 'kcal',
  carbs_g: 30,
  protein_g: 10,
  fat_g: 5,
  unit: 'g',
  user_id,
})

const record = (
  id: string,
  user_id: string,
  record_time: string,
  totals: Partial<Pick<MealRecord, 'calories_total' | 'carbs_total' | 'protein_total' | 'fat_total'>> = {},
): MealRecord => ({
  id,
  user_id,
  food: food(`${id}-food`, user_id),
  serving_count: 1,
  record_time,
  calories_total: totals.calories_total ?? 100,
  carbs_total: totals.carbs_total ?? 20,
  protein_total: totals.protein_total ?? 10,
  fat_total: totals.fat_total ?? 5,
})

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
  useFoodStore.setState({
    foods: [],
    foodUsageCounts: {},
    lastUsedServings: {},
    savedFoodIds: {},
    newlyCreatedFoodIds: [],
    modifiedFoodIds: [],
  })
  useRecordStore.setState({ records: [] })
  usePlanStore.setState({
    localPlans: [],
    planUsageCounts: {},
    savedPlanIds: {},
    newlyCreatedPlanIds: [],
    modifiedPlanIds: [],
  })
  apiMocks.checkAvatar.mockReset()
  apiMocks.uploadAvatar.mockReset()
  apiMocks.getAvatar.mockReset()
  apiMocks.versionedSync.mockReset()
  dbRecordMocks.addRecord.mockReset()
}

describe('foodStore state and account logic', () => {
  beforeEach(resetStores)

  it('adds, updates, and deletes foods while enqueueing operations', () => {
    useFoodStore.getState().addFood(food('food-1'))
    expect(useFoodStore.getState().foods[0]).toMatchObject({ id: 'food-1', user_id: 'local-account' })
    expect(useFoodStore.getState().savedFoodIds['local-account']).toEqual(['food-1'])
    expect(useOperationStore.getState().getQueue()).toHaveLength(1)

    useFoodStore.getState().updateFood('food-1', { name: 'Rolled oats' })
    expect(useFoodStore.getState().getFoodById('food-1')?.name).toBe('Rolled oats')
    expect(useFoodStore.getState().modifiedFoodIds).toEqual(['food-1'])
    expect(useOperationStore.getState().getQueue()[1]).toMatchObject({
      operation_type: 'update',
      entity_type: 'food',
    })

    useFoodStore.getState().deleteFood('food-1')
    expect(useFoodStore.getState().getFoodById('food-1')).toBeUndefined()
    expect(useOperationStore.getState().getQueue()[2]).toMatchObject({
      operation_type: 'delete',
      entity_type: 'food',
    })
  })

  it('duplicates a food for a different account and keeps per-account selectors isolated', () => {
    useFoodStore.getState().addFood(food('food-1'))
    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })

    useFoodStore.getState().updateFood('food-1', { name: 'Account oats' })
    const accountFood = useFoodStore.getState().foods.find(item => item.user_id === account.id)
    expect(accountFood).toMatchObject({ name: 'Account oats', user_id: account.id })
    expect(accountFood?.id).not.toBe('food-1')
    expect(useFoodStore.getState().foods).toHaveLength(2)

    useFoodStore.getState().incrementFoodUsage(accountFood!.id)
    useFoodStore.getState().setLastUsedServing(accountFood!.id, 2)
    expect(useFoodStore.getState().getFoodUsageCount(accountFood!.id)).toBe(1)
    expect(useFoodStore.getState().getLastUsedServing(accountFood!.id)).toBe(2)
    expect(useFoodStore.getState().getFoodUsageCount(accountFood!.id, 'local-account')).toBe(0)
  })

  it('searches, saves, clears account data, and applies remote upserts/deletes', () => {
    useFoodStore.getState().setFoods([food('food-1', 'local-account'), food('food-2', account.id)])
    useFoodStore.getState().markFoodAsNew('food-1')
    useFoodStore.getState().markFoodAsModified('food-2')
    useFoodStore.getState().clearNewFoods()
    useFoodStore.getState().clearModifiedFoods()
    expect(useFoodStore.getState().newlyCreatedFoodIds).toEqual([])
    expect(useFoodStore.getState().modifiedFoodIds).toEqual([])
    expect(useFoodStore.getState().searchFoods('OATS')).toHaveLength(1)
    expect(useFoodStore.getState().searchFoods('   ')).toHaveLength(2)

    useFoodStore.getState().saveFoodToAccount('food-1')
    useFoodStore.getState().saveFoodToAccount('food-1')
    expect(useFoodStore.getState().isFoodSaved('food-1')).toBe(true)
    expect(useFoodStore.getState().getSavedFoodsForAccount()).toEqual([food('food-1', 'local-account')])
    useFoodStore.getState().removeFoodFromAccount('food-1')
    expect(useFoodStore.getState().isFoodSaved('food-1')).toBe(false)

    useFoodStore.getState().applyRemoteOperation('update', { id: 'food-2', name: 'Remote rice' })
    expect(useFoodStore.getState().getFoodById('food-2')?.name).toBe('Remote rice')
    useFoodStore.getState().applyRemoteOperation('add', food('food-3', account.id) as unknown as Record<string, unknown>)
    expect(useFoodStore.getState().getFoodById('food-3')).toBeDefined()
    useFoodStore.getState().applyRemoteOperation('delete', { id: 'food-3' })
    expect(useFoodStore.getState().getFoodById('food-3')).toBeUndefined()
    expect(useOperationStore.getState().getQueue()).toEqual([])

    useFoodStore.getState().setLastUsedServing('food-1', 3, account.id)
    useFoodStore.getState().incrementFoodUsage('food-1', account.id)
    useFoodStore.getState().clearFoodsForAccount(account.id)
    expect(useFoodStore.getState().foods.map(item => item.id)).toEqual(['food-1'])
    expect(useFoodStore.getState().getFoodUsageCount('food-1', account.id)).toBe(0)
    expect(useFoodStore.getState().getLastUsedServing('food-1', account.id)).toBeNull()
  })
})

describe('recordStore selectors and operation effects', () => {
  beforeEach(resetStores)

  it('adds records to the current account, persists a local projection, and updates/deletes them', async () => {
    dbRecordMocks.addRecord.mockResolvedValue({ local_id: 'local-record' })
    useRecordStore.getState().addRecord({
      food: food('food-1'),
      serving_count: 2,
      record_time: '2025-03-15T12:00:00.000Z',
      calories_total: 400,
      carbs_total: 60,
      protein_total: 20,
      fat_total: 10,
    })
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
    const added = useRecordStore.getState().records[0]
    expect(added).toMatchObject({ user_id: 'local-account', calories_total: 400 })
    expect(dbRecordMocks.addRecord).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'local-account',
      food_name: 'Oats',
      serving_size: 2,
      calories: 400,
    }))
    expect(useOperationStore.getState().getQueue()).toHaveLength(1)

    useRecordStore.getState().updateRecord(added.id, { calories_total: 450 })
    expect(useRecordStore.getState().records[0].calories_total).toBe(450)
    expect(useOperationStore.getState().getQueue()[1]).toMatchObject({ operation_type: 'update', entity_type: 'record' })
    useRecordStore.getState().deleteRecord(added.id)
    expect(useRecordStore.getState().records).toEqual([])
    expect(useOperationStore.getState().getQueue()[2]).toMatchObject({ operation_type: 'delete', entity_type: 'record' })
  })

  it('groups records by date and account and aggregates only non-negative nutrients', () => {
    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
    const records = [
      record('late', account.id, '2025-03-15T18:00:00.000Z', { calories_total: 300, carbs_total: 40, protein_total: 20, fat_total: 10 }),
      record('early', account.id, '2025-03-15T08:00:00.000Z', { calories_total: 500, carbs_total: -2, protein_total: 30, fat_total: 15 }),
      record('other-user', 'other-user', '2025-03-15T09:00:00.000Z'),
      record('other-day', account.id, '2025-03-16T09:00:00.000Z'),
    ]
    useRecordStore.getState().setRecords(records)

    expect(useRecordStore.getState().getRecordsByDate('2025-03-15').map(item => item.id)).toEqual(['early', 'late'])
    expect(useRecordStore.getState().getRecordsByDate('2025-03-15', 'other-user').map(item => item.id)).toEqual(['other-user'])
    expect(useRecordStore.getState().getDailyNutrition('2025-03-15')).toEqual({
      calories: 800,
      protein: 50,
      carbs: 40,
      fat: 25,
    })
  })

  it('replaces only the selected account date and upserts remote records without queueing', () => {
    useRecordStore.setState({
      records: [
        record('local-old', 'local-account', '2025-03-15T09:00:00.000Z'),
        record('local-other-day', 'local-account', '2025-03-16T09:00:00.000Z'),
        record('remote-same-day', account.id, '2025-03-15T09:00:00.000Z'),
      ],
    })
    useRecordStore.getState().setRecordsForDate('2025-03-15', [record('replacement', 'local-account', '2025-03-15T11:00:00.000Z')])
    expect(useRecordStore.getState().records.map(item => item.id)).toEqual([
      'local-other-day',
      'remote-same-day',
      'replacement',
    ])

    useRecordStore.getState().applyRemoteOperation('update', { id: 'replacement', calories_total: 999 })
    expect(useRecordStore.getState().records.find(item => item.id === 'replacement')?.calories_total).toBe(999)
    useRecordStore.getState().applyRemoteOperation('add', record('remote-new', account.id, '2025-03-15T12:00:00.000Z') as unknown as Record<string, unknown>)
    expect(useRecordStore.getState().records).toHaveLength(4)
    useRecordStore.getState().applyRemoteOperation('delete', { id: 'remote-new' })
    expect(useRecordStore.getState().records).toHaveLength(3)
    expect(useOperationStore.getState().getQueue()).toEqual([])
  })
})

describe('planStore calculations and account behavior', () => {
  beforeEach(resetStores)

  it('creates plans, calculates totals, converts API shape, and enqueues mutations', () => {
    const items = [
      { food_id: 'food-1', food: food('food-1'), quantity: 50 },
      { food_id: 'food-2', food: { ...food('food-2'), calorie: 100, protein_g: 4, carbs_g: 20, fat_g: 2 }, quantity: 200 },
    ]
    const plan = usePlanStore.getState().addLocalPlan('Breakfast', items, 'local-account')
    const detail = usePlanStore.getState().getLocalPlanDetail(plan.id)
    expect(detail).toMatchObject({
      name: 'Breakfast',
      item_count: 2,
      total_calories: 300,
      total_protein: 13,
      total_fat: 6.5,
      total_carbs: 55,
    })
    expect(detail?.items.map(item => item.sort_order)).toEqual([0, 1])
    expect(localPlanToApiFormat(plan)).toMatchObject({
      id: plan.id,
      item_count: 2,
      total_calories: 300,
      total_protein: 13,
      total_fat: 6.5,
      total_carbs: 55,
    })
    expect(useOperationStore.getState().getQueue()).toHaveLength(1)

    usePlanStore.getState().updateLocalPlan(plan.id, 'Updated', items.slice(0, 1))
    expect(usePlanStore.getState().getLocalPlanDetail(plan.id)?.name).toBe('Updated')
    expect(usePlanStore.getState().modifiedPlanIds).toEqual([plan.id])
    usePlanStore.getState().deleteLocalPlan(plan.id)
    expect(usePlanStore.getState().getLocalPlanDetail(plan.id)).toBeNull()
    expect(useOperationStore.getState().getQueue()).toHaveLength(3)
  })

  it('keys usage and saved plans by account and supports remote upserts/deletes', () => {
    const plan = usePlanStore.getState().addLocalPlan('Local', [], 'local-account')
    usePlanStore.getState().incrementPlanUsage(plan.id)
    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
    usePlanStore.getState().incrementPlanUsage(plan.id)
    expect(usePlanStore.getState().getPlanUsageCount(plan.id)).toBe(1)
    expect(usePlanStore.getState().getPlanUsageCount(plan.id, 'local-account')).toBe(1)

    usePlanStore.getState().savePlanToAccount(plan.id)
    expect(usePlanStore.getState().isPlanSaved(plan.id)).toBe(true)
    usePlanStore.getState().removePlanFromAccount(plan.id)
    expect(usePlanStore.getState().isPlanSaved(plan.id)).toBe(false)
    usePlanStore.getState().markPlanAsNew(plan.id)
    usePlanStore.getState().markPlanAsModified(plan.id)
    usePlanStore.getState().clearNewPlans()
    usePlanStore.getState().clearModifiedPlans()
    expect(usePlanStore.getState().newlyCreatedPlanIds).toEqual([])
    expect(usePlanStore.getState().modifiedPlanIds).toEqual([])

    const otherAccountPlan = usePlanStore.getState().addLocalPlan('Other account', [], 'other-user')
    usePlanStore.getState().incrementPlanUsage(otherAccountPlan.id, 'other-user')
    usePlanStore.getState().savePlanToAccount(otherAccountPlan.id, 'other-user')
    usePlanStore.getState().clearPlansForAccount('other-user')
    expect(usePlanStore.getState().getLocalPlanDetail(otherAccountPlan.id)).toBeNull()
    expect(usePlanStore.getState().getPlanUsageCount(otherAccountPlan.id, 'other-user')).toBe(0)
    expect(usePlanStore.getState().isPlanSaved(otherAccountPlan.id, 'other-user')).toBe(false)

    const remotePlan = { ...plan, id: 'remote-plan', name: 'Remote' }
    usePlanStore.getState().applyRemoteOperation('add', remotePlan as unknown as Record<string, unknown>)
    usePlanStore.getState().applyRemoteOperation('update', { id: 'remote-plan', name: 'Updated remote' })
    expect(usePlanStore.getState().getLocalPlanDetail('remote-plan')?.name).toBe('Updated remote')
    usePlanStore.getState().applyRemoteOperation('delete', { id: 'remote-plan' })
    expect(usePlanStore.getState().getLocalPlanDetail('remote-plan')).toBeNull()
  })

  it('copies a plan update to the active account when the source belongs elsewhere', () => {
    const source = usePlanStore.getState().addLocalPlan('Source', [], 'other-user')
    useAuthStore.setState({ user: account, isLoggedIn: true, isLocalAccount: false, currentAccountId: account.id })
    usePlanStore.getState().updateLocalPlan(source.id, 'Copied', [])
    const copied = usePlanStore.getState().localPlans.find(item => item.user_id === account.id)
    expect(copied).toMatchObject({ name: 'Copied', user_id: account.id })
    expect(copied?.id).not.toBe(source.id)
  })
})

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

describe('avatar hashing and cache/sync behavior', () => {
  beforeEach(() => {
    resetStores()
    vi.restoreAllMocks()
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
