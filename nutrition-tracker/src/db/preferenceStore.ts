import type { LocalPreference } from './types';
import { getDB, getTimestamp } from './db';

export async function setPreference(pref: Omit<LocalPreference, 'last_modified'>): Promise<void> {
  const db = await getDB();
  const localPref: LocalPreference = {
    ...pref,
    last_modified: getTimestamp(),
  };
  await db.put('preferences', localPref);
}

export async function getPreference(userId: string): Promise<LocalPreference | undefined> {
  const db = await getDB();
  return db.get('preferences', userId);
}

export async function deletePreference(userId: string): Promise<void> {
  const db = await getDB();
  await db.delete('preferences', userId);
}

