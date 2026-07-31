import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type LocalRecord,
  type LocalFood,
  type LocalGoal,
  type LocalPreference,
} from './types';

interface CalorieTrackerDB extends DBSchema {
  records: {
    key: string;
    value: LocalRecord;
    indexes: {
      'by-user': string;
      'by-record-time': string;
    };
  };
  foods: {
    key: string;
    value: LocalFood;
    indexes: {
      'by-user': string;
    };
  };
  goals: {
    key: string;
    value: LocalGoal;
  };
  preferences: {
    key: string;
    value: LocalPreference;
  };
}

let dbInstance: IDBPDatabase<CalorieTrackerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CalorieTrackerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CalorieTrackerDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // records store
      const recordStore = db.createObjectStore('records', { keyPath: 'local_id' });
      recordStore.createIndex('by-user', 'user_id');
      recordStore.createIndex('by-record-time', 'record_time');

      // foods store
      const foodStore = db.createObjectStore('foods', { keyPath: 'local_id' });
      foodStore.createIndex('by-user', 'user_id');

      // goals store
      db.createObjectStore('goals', { keyPath: 'user_id' });

      // preferences store
      db.createObjectStore('preferences', { keyPath: 'user_id' });
    },
  });

  return dbInstance;
}

// 生成 UUID
export function generateUUID(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// 获取当前时间戳
export function getTimestamp(): number {
  return Date.now();
}

// 获取匿名用户ID
export function getAnonymousUserId(): string {
  return 'anonymous';
}

