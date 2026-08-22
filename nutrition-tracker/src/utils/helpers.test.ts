import dayjs from 'dayjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateProgress,
  formatDate,
  formatDateTime,
  formatTime,
  getCurrentTime,
  getMonthDates,
  getNutrientColor,
  getToday,
  getWeekDates,
  isToday,
} from './helpers'

describe('date helpers', () => {
  beforeEach(() => vi.setSystemTime(new Date('2025-03-15T13:14:15.000Z')))
  afterEach(() => vi.useRealTimers())

  it('formats dates, times, and date-times', () => {
    const date = new Date('2025-03-15T13:14:15.000Z')
    expect(formatDate(date)).toBe('2025-03-15')
    expect(formatTime(date)).toBe('13:14')
    expect(formatDateTime(date)).toBe('03-15 13:14')
    expect(getToday()).toBe('2025-03-15')
    expect(getCurrentTime()).toBe('13:14')
    expect(isToday('2025-03-15')).toBe(true)
    expect(isToday('2025-03-14')).toBe(false)
  })

  it('returns ordered seven-day and thirty-day ranges ending today', () => {
    const week = getWeekDates()
    const month = getMonthDates()
    expect(week).toHaveLength(7)
    expect(month).toHaveLength(30)
    expect(week.at(-1)).toBe(getToday())
    expect(month.at(-1)).toBe(getToday())
    expect(week).toEqual(
      Array.from({ length: 7 }, (_, index) => dayjs().subtract(6 - index, 'day').format('YYYY-MM-DD'))
    )
    expect(month.every((date, index) => index === 0 || date >= month[index - 1])).toBe(true)
  })
})

describe('nutrition helpers', () => {
  it('calculates bounded rounded progress', () => {
    expect(calculateProgress(0, 2_000)).toBe(0)
    expect(calculateProgress(1_001, 2_000)).toBe(50)
    expect(calculateProgress(3_000, 2_000)).toBe(100)
    expect(calculateProgress(-10, 2_000)).toBe(-0)
    expect(calculateProgress(100, 0)).toBe(0)
  })

  it('maps known nutrient keys and falls back for unknown keys', () => {
    expect(getNutrientColor('calories')).toBe('#ff6b6b')
    expect(getNutrientColor('protein')).toBe('#4ecdc4')
    expect(getNutrientColor('unknown')).toBe('#999')
  })
})
