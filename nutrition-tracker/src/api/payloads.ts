import dayjs from 'dayjs'

type Payload = Record<string, unknown>

/** 修复 record_time 格式：兼容旧数据（不带时区的本地时间字符串） */
export const fixRecordTime = (time: string | undefined): string => {
  if (!time) return new Date().toISOString()
  // 已经是 ISO 格式（带 Z 或时区偏移）时直接返回
  if (time.includes('Z') || time.includes('+') || time.includes('-')) {
    return time
  }
  // 否则视为本地时间，转换为 UTC ISO 格式
  return dayjs(time).toISOString()
}

export const planItemsPayload = (items: Payload[] | undefined) =>
  items?.map(item => ({
    food_id: item.food_id,
    food: item.food,
    quantity: item.quantity,
  }))

export const foodPayload = (food: Payload) => ({
  name: food.name,
  num: food.num,
  calorie: food.calorie,
  carbs_g: food.carbs_g,
  protein_g: food.protein_g,
  fat_g: food.fat_g,
  unit: food.unit,
})

export const recordPayload = (record: Payload) => {
  const food = record.food as Payload | undefined
  return {
    food_id: record.food_id || food?.id,
    food,
    serving_count: record.serving_count,
    record_time: fixRecordTime(record.record_time as string | undefined),
    calories_total: record.calories_total,
    carbs_total: record.carbs_total,
    protein_total: record.protein_total,
    fat_total: record.fat_total,
    plan_id: record.plan_id,
    plan_name: record.plan_name,
    plan_items: planItemsPayload(record.plan_items as Payload[] | undefined),
    is_quick_add: record.is_quick_add,
  }
}

export const goalTemplatePayload = (template: Payload) => ({
  name: template.name,
  type: template.type,
  cycle_days: template.cycle_days,
  today_index: template.today_index,
  daily_goals: template.daily_goals,
  last_active_date: template.last_active_date,
})
