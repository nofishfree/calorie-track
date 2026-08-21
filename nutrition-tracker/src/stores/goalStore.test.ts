import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalTemplate, StoredUserGoals } from '../types'
import { useAuthStore } from './authStore'
import { useGoalStore } from './goalStore'
import { useOperationStore } from './operationStore'

const dailyGoals = [
  { calorie_target: 1800, carb_target_g: 200, protein_target_g: 120, fat_target_g: 60 },
  { calorie_target: 2200, carb_target_g: 260, protein_target_g: 160, fat_target_g: 75 },
  { calorie_target: 2000, carb_target_g: 230, protein_target_g: 150, fat_target_g: 65 },
]

const cycleTemplate = (overrides: Partial<GoalTemplate> = {}): GoalTemplate => ({
  id: 'cycle-1',
  name: 'Cycle',
  type: 'cycle',
  cycle_days: 3,
  today_index: 1,
  daily_goals: dailyGoals,
  is_current: true,
  ...overrides,
})

function resetStores() {
  useAuthStore.setState({
    user: { id: 'local-account', email: '本地账号', username: '本地账号', data_version: 0 },
    token: null,
    isLoggedIn: false,
    isLocalAccount: true,
    savedAccounts: [],
    currentAccountId: 'local-account',
  })
  useGoalStore.setState({ templates: {}, currentTemplateId: {} })
  useOperationStore.setState({ queues: {}, isSyncing: false, pollingTimer: null })
}

describe('goal date and selection logic', () => {
  beforeEach(() => {
    resetStores()
    vi.setSystemTime(new Date('2025-03-15T12:00:00.000Z'))
  })

  it('initializes and advances cycle dates with modulo rollover', () => {
    useGoalStore.getState().syncTemplates([
      cycleTemplate({ last_active_date: undefined }),
      cycleTemplate({ id: 'daily-1', type: 'daily', name: 'Daily' }),
    ], 'cycle-1')
    useGoalStore.getState().checkAndUpdateDate()
    expect(useGoalStore.getState().getTemplates().find(t => t.id === 'cycle-1')?.last_active_date).toBe('2025-03-15')

    useGoalStore.setState({
      templates: { 'local-account': [cycleTemplate({ last_active_date: '2025-03-10', today_index: 1 })] },
      currentTemplateId: { 'local-account': 'cycle-1' },
    })
    useGoalStore.getState().checkAndUpdateDate()
    expect(useGoalStore.getState().getTemplates()[0].today_index).toBe(0)
    expect(useGoalStore.getState().getTemplates()[0].last_active_date).toBe('2025-03-15')
  })

  it('ignores daily templates and clamps current goal indexes', () => {
    const template = cycleTemplate({ type: 'daily', today_index: 99, daily_goals: dailyGoals.slice(0, 2) })
    useGoalStore.getState().syncTemplates([template], template.id)
    useGoalStore.getState().checkAndUpdateDate()
    expect(useGoalStore.getState().getTemplates()[0].last_active_date).toBeUndefined()
    expect(useGoalStore.getState().getCurrentGoal().today_index).toBe(1)
    expect(useGoalStore.getState().getCurrentGoal().calorie_target).toBe(2200)
  })

  it('returns defaults without a template and calculates a goal for a date', () => {
    expect(useGoalStore.getState().getCurrentGoal()).toMatchObject({
      cycle_days: 1,
      today_index: 0,
      calorie_target: 2000,
    })
    useGoalStore.getState().syncTemplates([cycleTemplate({ today_index: 0 })], 'cycle-1')
    expect(useGoalStore.getState().getGoalForDate('2025-03-16')).toMatchObject({
      today_index: 1,
      calorie_target: 2200,
    })
    expect(useGoalStore.getState().getGoalForDate('2025-03-14')).toMatchObject({
      today_index: 2,
      calorie_target: 2000,
    })
  })
})

describe('goal template CRUD and remote sync', () => {
  beforeEach(() => {
    resetStores()
    vi.setSystemTime(new Date('2025-03-15T12:00:00.000Z'))
  })

  it('adds, updates, selects, and deletes templates with current reassignment', () => {
    const first = cycleTemplate()
    const second = cycleTemplate({ id: 'cycle-2', name: 'Second' })
    useGoalStore.getState().syncTemplates([first, second], first.id)

    useGoalStore.getState().setCurrentTemplate('missing')
    expect(useGoalStore.getState().getTemplates().find(t => t.id === first.id)?.is_current).toBe(true)
    useGoalStore.getState().setCurrentTemplate(second.id)
    expect(useGoalStore.getState().getTemplates().find(t => t.id === second.id)?.is_current).toBe(true)

    useGoalStore.getState().updateTemplate({ ...second, name: 'Updated' })
    expect(useGoalStore.getState().getTemplates().find(t => t.id === second.id)?.name).toBe('Updated')
    useGoalStore.getState().deleteTemplate(second.id)
    expect(useGoalStore.getState().currentTemplateId['local-account']).toBe(first.id)
    expect(useGoalStore.getState().getTemplates()).toHaveLength(1)
    expect(useOperationStore.getState().getQueue()).toHaveLength(2)
  })

  it('creates a template from stored goals and supports template id updates', () => {
    const goal: StoredUserGoals = {
      cycle_days: 2,
      today_index: 1,
      daily_goals: dailyGoals.slice(0, 2),
      last_active_date: '2025-03-14',
    }
    useGoalStore.getState().setGoal(goal)
    const created = useGoalStore.getState().getTemplates()[0]
    expect(created.type).toBe('cycle')
    expect(useGoalStore.getState().getFullGoal()).toMatchObject({
      ...goal,
      last_active_date: '2025-03-15',
    })
    useGoalStore.getState().updateTemplateId(created.id, 'server-id')
    expect(useGoalStore.getState().currentTemplateId['local-account']).toBe('server-id')
    expect(useGoalStore.getState().getTemplates()[0].id).toBe('server-id')
  })

  it('upserts and deletes remote templates without enqueueing operations', () => {
    useGoalStore.getState().syncTemplates([cycleTemplate()], 'cycle-1')
    useGoalStore.getState().applyRemoteOperation('update', { id: 'cycle-1', name: 'Remote' })
    expect(useGoalStore.getState().getTemplates()[0].name).toBe('Remote')
    useGoalStore.getState().applyRemoteOperation('add', { ...cycleTemplate({ id: 'cycle-2' }), name: 'New' })
    expect(useGoalStore.getState().getTemplates()).toHaveLength(2)
    useGoalStore.getState().applyRemoteOperation('delete', { id: 'cycle-1' })
    expect(useGoalStore.getState().getTemplates().map(t => t.id)).toEqual(['cycle-2'])
    expect(useOperationStore.getState().getQueue()).toEqual([])
  })
})
