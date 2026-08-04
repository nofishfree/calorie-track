import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type LocalRecord,
  type LocalFood,
  type LocalGoal,
  type LocalPreference,
  type LocalAvatar,
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
  avatars: {
    key: string;
    value: LocalAvatar;
  };
}

let dbInstance: IDBPDatabase<CalorieTrackerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CalorieTrackerDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<CalorieTrackerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // 版本 1: 初始 stores
      if (oldVersion < 1) {
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
      }

      // 版本 2: 添加 avatars store
      if (oldVersion < 2) {
        db.createObjectStore('avatars', { keyPath: 'hash' });
      }
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

// 清除指定用户的所有本地缓存数据
export async function clearUserData(userId: string): Promise<void> {
  const db = await getDB();
  
  // 清除 records
  const recordTx = db.transaction('records', 'readwrite');
  const recordStore = recordTx.objectStore('records');
  const recordIndex = recordStore.index('by-user');
  const recordKeys = await recordIndex.getAllKeys(userId);
  for (const key of recordKeys) {
    await recordStore.delete(key);
  }
  
  // 清除 foods
  const foodTx = db.transaction('foods', 'readwrite');
  const foodStore = foodTx.objectStore('foods');
  const foodIndex = foodStore.index('by-user');
  const foodKeys = await foodIndex.getAllKeys(userId);
  for (const key of foodKeys) {
    await foodStore.delete(key);
  }
  
  // 清除 goals
  const goalTx = db.transaction('goals', 'readwrite');
  await goalTx.objectStore('goals').delete(userId);
  
  // 清除 preferences
  const prefTx = db.transaction('preferences', 'readwrite');
  await prefTx.objectStore('preferences').delete(userId);
}

