import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'
import { usePlanStore, localPlanToApiFormat } from './planStore'
import { account, food, resetStores } from './testHelpers'

const dbRecordMocks = vi.hoisted(() => ({
  addRecord: vi.fn(),
}))

vi.mock('../db/recordStore', () => dbRecordMocks)

describe('planStore calculations and account behavior', () => {
  beforeEach(() => {
    resetStores()
    dbRecordMocks.addRecord.mockReset()
  })

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
