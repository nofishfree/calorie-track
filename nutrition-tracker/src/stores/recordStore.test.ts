import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'
import { useRecordStore } from './recordStore'
import { account, food, record, resetStores } from './testHelpers'

const dbRecordMocks = vi.hoisted(() => ({
  addRecord: vi.fn(),
}))

vi.mock('../db/recordStore', () => dbRecordMocks)

describe('recordStore selectors and operation effects', () => {
  beforeEach(() => {
    resetStores()
    dbRecordMocks.addRecord.mockReset()
  })

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
