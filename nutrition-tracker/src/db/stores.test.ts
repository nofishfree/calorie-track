import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDB, getAnonymousUserId, getTimestamp } from './db'
import {
  addFood,
  deleteFood,
  getFoodByLocalId,
  getFoodsByUserId,
  migrateAnonymousFoods,
  updateFood,
} from './foodStore'
import { deleteGoal, getGoal, setGoal } from './goalStore'
import { deletePreference, getPreference, setPreference } from './preferenceStore'

beforeEach(async () => {
  const db = await getDB()
  const tx = db.transaction(['records', 'foods', 'goals', 'preferences', 'avatars'], 'readwrite')
  await Promise.all([
    tx.objectStore('records').clear(),
    tx.objectStore('foods').clear(),
    tx.objectStore('goals').clear(),
    tx.objectStore('preferences').clear(),
    tx.objectStore('avatars').clear(),
  ])
  await tx.done
})

describe('IndexedDB stores', () => {
  it('creates stores and generates stable utility values', async () => {
    const db = await getDB()
    expect(db.objectStoreNames).toContain('foods')
    expect(db.objectStoreNames).toContain('records')
    expect(getAnonymousUserId()).toBe('anonymous')
    expect(getTimestamp()).toBeTypeOf('number')
  })

  it('supports food CRUD and anonymous migration', async () => {
    const food = await addFood({
      user_id: getAnonymousUserId(),
      food_name: 'Oats',
      serving_size: 100,
      serving_unit: 'g',
      calories_per_100g: 380,
      protein_per_100g: 13,
      fat_per_100g: 7,
      carb_per_100g: 68,
    })
    expect(await getFoodsByUserId('anonymous')).toHaveLength(1)
    await updateFood(food.local_id, { food_name: 'Rolled oats' })
    expect((await getFoodByLocalId(food.local_id))?.food_name).toBe('Rolled oats')
    await migrateAnonymousFoods('user-1')
    expect(await getFoodsByUserId('anonymous')).toHaveLength(0)
    expect((await getFoodsByUserId('user-1'))[0].user_id).toBe('user-1')
    await deleteFood(food.local_id)
    expect(await getFoodByLocalId(food.local_id)).toBeUndefined()
  })

  it('sets, reads, and deletes goals and preferences with timestamps', async () => {
    await setGoal({ user_id: 'user-1', calorie_target: 2_000, carb_target_g: 250, protein_target_g: 150, fat_target_g: 65 })
    expect(await getGoal('user-1')).toMatchObject({ user_id: 'user-1', calorie_target: 2_000 })
    await deleteGoal('user-1')
    expect(await getGoal('user-1')).toBeUndefined()

    await setPreference({ user_id: 'user-1', theme: 'dark' })
    expect(await getPreference('user-1')).toMatchObject({ user_id: 'user-1', theme: 'dark' })
    await deletePreference('user-1')
    expect(await getPreference('user-1')).toBeUndefined()
  })
})
