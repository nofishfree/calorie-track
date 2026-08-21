import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { useFoodStore } from './foodStore'
import { useOperationStore } from './operationStore'
import { account, food, resetStores } from './testHelpers'

const apiMocks = vi.hoisted(() => ({
  versionedSync: vi.fn(),
}))

const dbRecordMocks = vi.hoisted(() => ({
  addRecord: vi.fn(),
}))

vi.mock('../api', () => ({ syncAPI: apiMocks }))
vi.mock('../db/recordStore', () => dbRecordMocks)

describe('foodStore state and account logic', () => {
  beforeEach(() => {
    resetStores()
    apiMocks.versionedSync.mockReset()
    dbRecordMocks.addRecord.mockReset()
  })

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
