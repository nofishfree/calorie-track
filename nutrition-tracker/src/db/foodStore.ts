import type { LocalFood } from './types';
import { getDB, generateUUID, getAnonymousUserId } from './db';

export async function addFood(food: Omit<LocalFood, 'local_id'>): Promise<LocalFood> {
  const db = await getDB();
  const localFood: LocalFood = {
    ...food,
    local_id: generateUUID(),
  };
  await db.put('foods', localFood);
  return localFood;
}

export async function updateFood(localId: string, updates: Partial<Omit<LocalFood, 'local_id'>>): Promise<void> {
  const db = await getDB();
  const food = await db.get('foods', localId);
  if (food) {
    const updatedFood: LocalFood = {
      ...food,
      ...updates,
    };
    await db.put('foods', updatedFood);
  }
}

export async function deleteFood(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete('foods', localId);
}

export async function getFoodsByUserId(userId: string): Promise<LocalFood[]> {
  const db = await getDB();
  return db.getAllFromIndex('foods', 'by-user', userId);
}

export async function getFoodByLocalId(localId: string): Promise<LocalFood | undefined> {
  const db = await getDB();
  return db.get('foods', localId);
}

export async function deleteFoodsByUserId(userId: string): Promise<void> {
  const db = await getDB();
  const foods = await db.getAllFromIndex('foods', 'by-user', userId);
  for (const food of foods) {
    await db.delete('foods', food.local_id);
  }
}

export async function migrateAnonymousFoods(toUserId: string): Promise<void> {
  const db = await getDB();
  const anonymousFoods = await db.getAllFromIndex('foods', 'by-user', getAnonymousUserId());
  
  for (const food of anonymousFoods) {
    await db.put('foods', {
      ...food,
      user_id: toUserId,
    });
  }
}

