import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserGoals, StoredUserGoals, DailyGoal, GoalTemplate } from '../types'
import { useAuthStore } from './authStore'
import { useOperationStore } from './operationStore'
import dayjs from 'dayjs'
import { getToday } from '../utils/helpers'

const DEFAULT_DAILY_GOAL: DailyGoal = {
  calorie_target: 2000,
  carb_target_g: 250,
  protein_target_g: 150,
  fat_target_g: 65,
}

const DEFAULT_STORED_GOAL: StoredUserGoals = {
  cycle_days: 1,
  today_index: 0,
  daily_goals: [DEFAULT_DAILY_GOAL],
}

const DEFAULT_GOAL: UserGoals = {
  cycle_days: 1,
  today_index: 0,
  daily_goals: [DEFAULT_DAILY_GOAL],
  calorie_target: 2000,
  carb_target_g: 250,
  protein_target_g: 150,
  fat_target_g: 65,
}

const LOCAL_ACCOUNT_ID = 'local-account'

const generateId = () => crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15)

const createDefaultTemplate = (): GoalTemplate => ({
  id: generateId(),
  name: '默认目标',
  type: 'daily',
  cycle_days: 1,
  today_index: 0,
  daily_goals: [DEFAULT_DAILY_GOAL],
  is_current: true,
})

interface GoalState {
  templates: Record<string, GoalTemplate[]>
  currentTemplateId: Record<string, string>
  setGoal: (goal: StoredUserGoals) => void
  getCurrentGoal: () => UserGoals
  getGoalForDate: (date: string) => UserGoals
  getFullGoal: () => StoredUserGoals
  resetGoal: () => void
  checkAndUpdateDate: () => void
  getTemplates: () => GoalTemplate[]
  addTemplate: (template: Omit<GoalTemplate, 'id' | 'is_current'>) => void
  updateTemplate: (template: GoalTemplate) => void
  deleteTemplate: (templateId: string) => void
  setCurrentTemplate: (templateId: string) => void
  syncTemplates: (templates: GoalTemplate[], currentId: string) => void
  updateTemplateId: (oldId: string, newId: string) => void
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      templates: {},
      currentTemplateId: {},

      checkAndUpdateDate: () => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const accountId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const currentId = get().currentTemplateId[accountId]
        const templates = get().templates[accountId] || []
        const currentTemplate = templates.find(t => t.id === currentId)
        
        if (!currentTemplate || currentTemplate.type !== 'cycle') return

        const today = getToday()
        const lastDate = currentTemplate.last_active_date as string | undefined
        if (!lastDate || lastDate === today) {
          if (!lastDate) {
            set((state) => ({
              templates: {
                ...state.templates,
                [accountId]: templates.map(t => 
                  t.id === currentId ? { ...t, last_active_date: today } : t
                ),
              },
            }))
          }
          return
        }

        const dayDiff = dayjs(today).diff(dayjs(lastDate), 'day')
        if (dayDiff === 0) return

        const cycleDays = currentTemplate.cycle_days || currentTemplate.daily_goals?.length || 1
        const currentIndex = currentTemplate.today_index ?? 0
        let newIndex = (currentIndex + dayDiff) % cycleDays
        if (newIndex < 0) newIndex += cycleDays

        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: templates.map(t => 
              t.id === currentId ? { 
                ...t, 
                today_index: newIndex,
                last_active_date: today,
              } : t
            ),
          },
        }))
      },

      setGoal: (newGoal) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        const today = getToday()
        const templates = get().templates[accountId] || []
        const currentId = get().currentTemplateId[accountId]
        const currentTemplate = templates.find(t => t.id === currentId)

        if (currentTemplate) {
          set((state) => ({
            templates: {
              ...state.templates,
              [accountId]: templates.map(t => 
                t.id === currentId ? { 
                  ...t, 
                  ...newGoal, 
                  last_active_date: today,
                } : t
              ),
            },
          }))
        } else {
          const newTemplate: GoalTemplate = {
            id: generateId(),
            name: '默认目标',
            type: 'cycle',
            ...newGoal,
            last_active_date: today,
            is_current: true,
          }
          set((state) => ({
            templates: {
              ...state.templates,
              [accountId]: [newTemplate],
            },
            currentTemplateId: {
              ...state.currentTemplateId,
              [accountId]: newTemplate.id,
            },
          }))
        }
      },

      getCurrentGoal: () => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const accountId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const templates = get().templates[accountId] || []
        const currentId = get().currentTemplateId[accountId]
        const currentTemplate = templates.find(t => t.id === currentId)

        if (!currentTemplate) {
          const defaultTemplate = createDefaultTemplate()
          set((state) => ({
            templates: {
              ...state.templates,
              [accountId]: [defaultTemplate],
            },
            currentTemplateId: {
              ...state.currentTemplateId,
              [accountId]: defaultTemplate.id,
            },
          }))
          return DEFAULT_GOAL
        }

        const dailyGoals = currentTemplate.daily_goals || []
        const todayIndex = Math.min(Math.max(currentTemplate.today_index ?? 0, 0), dailyGoals.length - 1)
        const g = dailyGoals[todayIndex] || DEFAULT_DAILY_GOAL

        return {
          cycle_days: currentTemplate.cycle_days || dailyGoals.length || 1,
          today_index: todayIndex,
          daily_goals: dailyGoals,
          calorie_target: isNaN(Number(g.calorie_target)) ? Number(DEFAULT_DAILY_GOAL.calorie_target) : Number(g.calorie_target),
          carb_target_g: isNaN(Number(g.carb_target_g)) ? Number(DEFAULT_DAILY_GOAL.carb_target_g) : Number(g.carb_target_g),
          protein_target_g: isNaN(Number(g.protein_target_g)) ? Number(DEFAULT_DAILY_GOAL.protein_target_g) : Number(g.protein_target_g),
          fat_target_g: isNaN(Number(g.fat_target_g)) ? Number(DEFAULT_DAILY_GOAL.fat_target_g) : Number(g.fat_target_g),
        }
      },

      getGoalForDate: (date: string) => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const accountId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const templates = get().templates[accountId] || []
        const currentId = get().currentTemplateId[accountId]
        const currentTemplate = templates.find(t => t.id === currentId)

        if (!currentTemplate) {
          return get().getCurrentGoal()
        }

        const dailyGoals = currentTemplate.daily_goals || []
        const cycleDays = currentTemplate.cycle_days || dailyGoals.length || 1
        const todayIndex = currentTemplate.today_index ?? 0
        const dayDiff = dayjs(date).diff(dayjs(getToday()), 'day')
        let dayIndex = (todayIndex + dayDiff) % cycleDays
        if (dayIndex < 0) dayIndex += cycleDays
        dayIndex = Math.min(Math.max(dayIndex, 0), dailyGoals.length - 1)
        const g = dailyGoals[dayIndex] || DEFAULT_DAILY_GOAL

        return {
          cycle_days: cycleDays,
          today_index: dayIndex,
          daily_goals: dailyGoals,
          calorie_target: isNaN(Number(g.calorie_target)) ? Number(DEFAULT_DAILY_GOAL.calorie_target) : Number(g.calorie_target),
          carb_target_g: isNaN(Number(g.carb_target_g)) ? Number(DEFAULT_DAILY_GOAL.carb_target_g) : Number(g.carb_target_g),
          protein_target_g: isNaN(Number(g.protein_target_g)) ? Number(DEFAULT_DAILY_GOAL.protein_target_g) : Number(g.protein_target_g),
          fat_target_g: isNaN(Number(g.fat_target_g)) ? Number(DEFAULT_DAILY_GOAL.fat_target_g) : Number(g.fat_target_g),
        }
      },

      getFullGoal: () => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const accountId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        const templates = get().templates[accountId] || []
        const currentId = get().currentTemplateId[accountId]
        const currentTemplate = templates.find(t => t.id === currentId)

        if (!currentTemplate) {
          return DEFAULT_STORED_GOAL
        }

        return {
          cycle_days: currentTemplate.cycle_days || (currentTemplate.daily_goals?.length || 1),
          today_index: currentTemplate.today_index ?? 0,
          daily_goals: currentTemplate.daily_goals || [],
          last_active_date: currentTemplate.last_active_date as string | undefined,
        }
      },

      resetGoal: () => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        const defaultTemplate = createDefaultTemplate()
        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: [defaultTemplate],
          },
          currentTemplateId: {
            ...state.currentTemplateId,
            [accountId]: defaultTemplate.id,
          },
        }))
      },

      getTemplates: () => {
        const { currentAccountId, isLocalAccount } = useAuthStore.getState()
        const accountId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
        let templates = get().templates[accountId] || []
        
        if (templates.length === 0) {
          const defaultTemplate = createDefaultTemplate()
          set((state) => ({
            templates: {
              ...state.templates,
              [accountId]: [defaultTemplate],
            },
            currentTemplateId: {
              ...state.currentTemplateId,
              [accountId]: defaultTemplate.id,
            },
          }))
          templates = [defaultTemplate]
        }

        return templates.map(t => ({
          ...t,
          is_current: t.id === get().currentTemplateId[accountId],
        }))
      },

      addTemplate: (template) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        const templates = get().templates[accountId] || []
        const newTemplate: GoalTemplate = {
          ...template,
          id: generateId(),
          is_current: false,
        }
        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: [...templates, newTemplate],
          },
        }))
        useOperationStore.getState().addOperation('goal', newTemplate.id, newTemplate)
        return newTemplate
      },

      updateTemplate: (template) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        const templates = get().templates[accountId] || []
        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: templates.map(t => t.id === template.id ? template : t),
          },
        }))
        useOperationStore.getState().addOperation('goal', template.id, template, 'update')
      },

      deleteTemplate: (templateId) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        let templates = get().templates[accountId] || []
        
        if (templates.length <= 1) return

        const deletedTemplate = templates.find(t => t.id === templateId)
        templates = templates.filter(t => t.id !== templateId)
        
        let newCurrentId = get().currentTemplateId[accountId]
        if (newCurrentId === templateId) {
          newCurrentId = templates[0]?.id || ''
        }

        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: templates,
          },
          currentTemplateId: {
            ...state.currentTemplateId,
            [accountId]: newCurrentId,
          },
        }))
        
        useOperationStore.getState().deleteOperation('goal', templateId, deletedTemplate)
      },

      setCurrentTemplate: (templateId) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        const templates = get().templates[accountId] || []

        if (!templates.find(t => t.id === templateId)) return

        set((state) => ({
          currentTemplateId: {
            ...state.currentTemplateId,
            [accountId]: templateId,
          },
        }))
      },

      syncTemplates: (templates, currentId) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID

        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: templates,
          },
          currentTemplateId: {
            ...state.currentTemplateId,
            [accountId]: currentId,
          },
        }))
      },

      updateTemplateId: (oldId, newId) => {
        const { currentAccountId } = useAuthStore.getState()
        const accountId = currentAccountId || LOCAL_ACCOUNT_ID
        const templates = get().templates[accountId] || []
        const currentId = get().currentTemplateId[accountId]

        set((state) => ({
          templates: {
            ...state.templates,
            [accountId]: templates.map(t =>
              t.id === oldId ? { ...t, id: newId } : t
            ),
          },
          currentTemplateId: {
            ...state.currentTemplateId,
            [accountId]: currentId === oldId ? newId : currentId,
          },
        }))
      },
    }),
    {
      name: 'goal-storage',
    }
  )
)
