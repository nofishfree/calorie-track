import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MealRecord } from '../types'
import { generateUUID } from '../db/db'
import { addRecord as addRecordToDB } from '../db/recordStore'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'

const LOCAL_ACCOUNT_ID = 'local-account'

interface RecordState {
  records: MealRecord[]
  addRecord: (record: Omit<MealRecord, 'id' | 'user_id'>) => void
  updateRecord: (id: string, record: Partial<MealRecord>) => void
  deleteRecord: (id: string) => void
  setRecords: (records: MealRecord[]) => void
  setRecordsForDate: (date: string, newRecords: MealRecord[]) => void
  clearRecords: () => void
  getRecordsByDate: (date: string, userId?: string) => MealRecord[]
  getDailyNutrition: (date: string, userId?: string) => {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
}

export const useRecordStore = create<RecordState>()(
  persist(
    (set, get) => ({
      records: [],
      
      addRecord: (record) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const newRecord: MealRecord = {
          ...record,
          id: generateUUID(),
          user_id: userId,
        }
        set((state) => ({
          records: [...state.records, newRecord],
        }))
        useOperationStore.getState().addOperation('record', newRecord.id, newRecord)

        // 同时保存到 IndexedDB
        const recordToSave = {
          user_id: userId,
          record_time: newRecord.record_time,
          food_name: newRecord.food.name,
          food_id: newRecord.food.id,
          serving_size: newRecord.serving_count,
          serving_unit: newRecord.food.unit || 'g',
          calories: newRecord.calories_total,
          protein_g: newRecord.protein_total,
          fat_g: newRecord.fat_total,
          carb_g: newRecord.carbs_total,
        }

        queueMicrotask(async () => {
          try {
            await addRecordToDB(recordToSave)
          } catch (error) {
            console.error('Failed to save record to IndexedDB:', error)
          }
        })
      },
      
      updateRecord: (id, record) => {
        let updatedRecordData: MealRecord | null = null
        set((state) => {
          const existingRecord = state.records.find(r => r.id === id)
          if (existingRecord) {
            updatedRecordData = { ...existingRecord, ...record }
          }
          return {
            records: state.records.map((r) =>
              r.id === id ? { ...r, ...record } : r
            ),
          }
        })
        if (updatedRecordData) {
          useOperationStore.getState().addOperation('record', id, updatedRecordData, 'update')
        }
      },
      
      deleteRecord: (id) => {
        const record = get().records.find(r => r.id === id)
        set((state) => ({
          records: state.records.filter((r) => r.id !== id),
        }))
        useOperationStore.getState().deleteOperation('record', id, record)
      },
      
      setRecords: (records) => {
        set({ records })
      },

      setRecordsForDate: (date, newRecords) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        set((state) => {
          const otherRecords = state.records.filter((r) => {
            if (!r.record_time) return true
            const recordDate = r.record_time.split('T')[0]
            if (recordDate !== date) return true
            const recordUserId = r.user_id || r.food?.user_id || 'local-account'
            const normalizedUserId = recordUserId === 'local' ? 'local-account' : recordUserId
            return normalizedUserId !== userId
          })
          return { records: [...otherRecords, ...newRecords] }
        })
      },
      
      clearRecords: () => {
        set({ records: [] })
      },
      
      getRecordsByDate: (date, userId) => {
        const { currentAccountId: authAccountId, isLocalAccount } = useAuthStore.getState()
        const targetUserId = userId || (isLocalAccount ? LOCAL_ACCOUNT_ID : (authAccountId || LOCAL_ACCOUNT_ID))
        return get()
          .records.filter((r) => {
            if (!r.record_time) return false
            const recordDate = r.record_time.split('T')[0]
            if (recordDate !== date) return false
            const recordUserId = r.user_id || r.food?.user_id || 'local-account'
            const normalizedUserId = recordUserId === 'local' ? 'local-account' : recordUserId
            return normalizedUserId === targetUserId
          })
          .sort((a, b) => {
            if (!a.record_time || !b.record_time) return 0
            return a.record_time.localeCompare(b.record_time)
          })
      },
      
      getDailyNutrition: (date, userId) => {
        const records = get().getRecordsByDate(date, userId)
        return records.reduce(
          (acc, r) => ({
            calories: acc.calories + (r.calories_total >= 0 ? r.calories_total : 0),
            protein: acc.protein + (r.protein_total >= 0 ? r.protein_total : 0),
            carbs: acc.carbs + (r.carbs_total >= 0 ? r.carbs_total : 0),
            fat: acc.fat + (r.fat_total >= 0 ? r.fat_total : 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        )
      },
    }),
    {
      name: 'record-storage',
    }
  )
)

