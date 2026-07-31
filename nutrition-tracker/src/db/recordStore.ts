import type { LocalRecord } from './types';
import { getDB, generateUUID, getAnonymousUserId } from './db';
import { useAuthStore } from '../stores/authStore';

export async function addRecord(record: Omit<LocalRecord, 'local_id'>): Promise<LocalRecord> {
  const db = await getDB();
  const localRecord: LocalRecord = {
    ...record,
    local_id: generateUUID(),
  };
  await db.put('records', localRecord);
  return localRecord;
}

export async function updateRecord(localId: string, updates: Partial<Omit<LocalRecord, 'local_id'>>): Promise<void> {
  const db = await getDB();
  const record = await db.get('records', localId);
  if (record) {
    const updatedRecord: LocalRecord = {
      ...record,
      ...updates,
    };
    await db.put('records', updatedRecord);
  }
}

export async function deleteRecord(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete('records', localId);
}

export async function getRecordsByDate(date: string, userId?: string): Promise<LocalRecord[]> {
  const db = await getDB();
  const user_id = userId || useAuthStore.getState().user?.id || getAnonymousUserId();
  
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const startStr = startOfDay.toISOString();
  const endStr = endOfDay.toISOString();
  
  const allRecords = await db.getAllFromIndex('records', 'by-user', user_id);
  return allRecords.filter(record => 
    record.record_time >= startStr && record.record_time <= endStr
  ).sort((a, b) => new Date(a.record_time).getTime() - new Date(b.record_time).getTime());
}

export async function getRecordsByUserId(userId: string): Promise<LocalRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('records', 'by-user', userId);
}

export async function getRecordByLocalId(localId: string): Promise<LocalRecord | undefined> {
  const db = await getDB();
  return db.get('records', localId);
}

export async function deleteRecordsByUserId(userId: string): Promise<void> {
  const db = await getDB();
  const records = await db.getAllFromIndex('records', 'by-user', userId);
  for (const record of records) {
    await db.delete('records', record.local_id);
  }
}

export async function migrateAnonymousRecords(toUserId: string): Promise<void> {
  const db = await getDB();
  const anonymousRecords = await db.getAllFromIndex('records', 'by-user', getAnonymousUserId());
  
  for (const record of anonymousRecords) {
    await db.put('records', {
      ...record,
      user_id: toUserId,
    });
  }
}

