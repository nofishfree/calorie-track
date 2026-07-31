import dayjs from 'dayjs'

export const generateId = () => Math.random().toString(36).substring(2, 11)

export const formatDate = (date: Date | string) => dayjs(date).format('YYYY-MM-DD')

export const formatTime = (date: Date | string) => dayjs(date).format('HH:mm')

export const formatDateTime = (date: Date | string) => dayjs(date).format('MM-DD HH:mm')

export const getToday = () => formatDate(new Date())

export const getCurrentTime = () => formatTime(new Date())

export const isToday = (date: string) => date === getToday()

export const calculateProgress = (current: number, target: number) => {
  if (target === 0) return 0
  return Math.min(Math.round((current / target) * 100), 100)
}

export const getNutrientColor = (key: string) => {
  const colors: Record<string, string> = {
    calories: '#ff6b6b',
    protein: '#4ecdc4',
    carbs: '#ffe66d',
    fat: '#95e1d3',
    fiber: '#a8e6cf',
    sodium: '#dcd6f7',
  }
  return colors[key] || '#999'
}

export const getWeekDates = () => {
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) {
    dates.push(formatDate(dayjs().subtract(i, 'day').toDate()))
  }
  return dates
}

export const getMonthDates = () => {
  const dates: string[] = []
  for (let i = 29; i >= 0; i--) {
    dates.push(formatDate(dayjs().subtract(i, 'day').toDate()))
  }
  return dates
}

