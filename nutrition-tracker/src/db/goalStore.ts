import type { LocalGoal } from './types';
import { getDB, getTimestamp } from './db';

export async function setGoal(goal: Omit<LocalGoal, 'last_modified'>): Promise<void> {
  const db = await getDB();
  const localGoal: LocalGoal = {
    ...goal,
    last_modified: getTimestamp(),
  };
  await db.put('goals', localGoal);
}

export async function getGoal(userId: string): Promise<LocalGoal | undefined> {
  const db = await getDB();
  return db.get('goals', userId);
}

export async function deleteGoal(userId: string): Promise<void> {
  const db = await getDB();
  await db.delete('goals', userId);
}

