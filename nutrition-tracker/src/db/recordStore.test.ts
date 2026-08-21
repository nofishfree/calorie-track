import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDB } from './db'
import {
  addRecord,
  deleteRecord,
  deleteRecordsByUserId,
  getRecordByLocalId,
  getRecordsByDate,
  getRecordsByUserId,
  migrateAnonymousRecords,
  updateRecord,
} from './recordStore'
import { useAuthStore } from '../stores/authStore'

const record = (local_id: string, user_id: string, record_time: string) => ({
  local_id,
  user_id,
  record_time,
  food_name: local_id,
  food_id: `${local_id}-food`,
  serving_size: 1,
  serving_unit: 'g',
  calories: 100,
  protein_g: 10,
  fat_g: 5,
  carb_g: 20,
})

async function clearRecords() {
  const db = await getDB()
  const tx = db.transaction('records', 'readwrite')
  await tx.objectStore('records').clear()
  await tx.done
}

describe('IndexedDB record store', () => {
  beforeEach(async () => {
    await clearRecords()
    useAuthStore.setState({ user: { id: 'user-1', email: 'user@example.com' } })
    vi.setSystemTime(new Date('2025-03-15T12:00:00.000Z'))
  })

  it('supports record CRUD and user-index queries', async () => {
    const created = await addRecord(record('ignored', 'user-1', '2025-03-15T09:00:00.000Z'))
    expect(created.local_id).not.toBe('ignored')
    expect(await getRecordByLocalId(created.local_id)).toMatchObject({
      user_id: 'user-1',
      food_name: 'ignored',
    })
    await updateRecord(created.local_id, { calories: 250, food_name: 'Updated' })
    expect(await getRecordByLocalId(created.local_id)).toMatchObject({ calories: 250, food_name: 'Updated' })
    expect(await getRecordsByUserId('user-1')).toHaveLength(1)
    await deleteRecord(created.local_id)
    expect(await getRecordByLocalId(created.local_id)).toBeUndefined()
  })

  it('filters and sorts records by local date range, including the authenticated user default', async () => {
    await addRecord(record('morning', 'user-1', '2025-03-15T08:00:00.000Z'))
    await addRecord(record('evening', 'user-1', '2025-03-15T20:00:00.000Z'))
    await addRecord(record('other-day', 'user-1', '2025-03-16T08:00:00.000Z'))
    await addRecord(record('other-user', 'user-2', '2025-03-15T09:00:00.000Z'))

    expect((await getRecordsByDate('2025-03-15')).map(item => item.food_name)).toEqual(['morning', 'evening'])
    expect((await getRecordsByDate('2025-03-15', 'user-2')).map(item => item.food_name)).toEqual(['other-user'])
  })

  it('deletes all records for a user and migrates anonymous records', async () => {
    await addRecord(record('anonymous', 'anonymous', '2025-03-15T09:00:00.000Z'))
    await addRecord(record('owned', 'user-1', '2025-03-15T10:00:00.000Z'))
    await deleteRecordsByUserId('user-1')
    expect(await getRecordsByUserId('user-1')).toEqual([])

    await migrateAnonymousRecords('user-2')
    expect(await getRecordsByUserId('anonymous')).toEqual([])
    expect(await getRecordsByUserId('user-2')).toHaveLength(1)
    expect((await getRecordsByUserId('user-2'))[0].food_name).toBe('anonymous')
  })
})
