// 本地饮食记录
export interface LocalRecord {
  local_id: string;           // 本地生成的UUID
  user_id: string;            // 记录所属用户ID
  record_time: string;        // ISO 8601 格式时间
  food_name: string;          // 食物名称
  food_id?: string;           // 食物ID
  serving_size: number;       // 份量大小（克）
  serving_unit: string;       // 份量单位
  calories: number;           // 热量（千卡）
  protein_g: number;          // 蛋白质（克）
  fat_g: number;              // 脂肪（克）
  carb_g: number;             // 碳水（克）
}

// 本地自定义食物
export interface LocalFood {
  local_id: string;           // 本地生成的UUID
  user_id: string;            // 食物所属用户ID
  food_name: string;          // 食物名称
  serving_size: number;       // 份量大小（克）
  serving_unit: string;       // 份量单位
  calories_per_100g: number;  // 每100克热量（千卡）
  protein_per_100g: number;   // 每100克蛋白质（克）
  fat_per_100g: number;       // 每100克脂肪（克）
  carb_per_100g: number;      // 每100克碳水（克）
}

// 本地目标
export interface LocalGoal {
  user_id: string;
  calorie_target: number;
  carb_target_g: number;
  protein_target_g: number;
  fat_target_g: number;
  last_modified: number;
}

// 本地偏好设置
export interface LocalPreference {
  user_id: string;
  theme: 'light' | 'dark';
  last_modified: number;
}

// 待同步操作队列
export interface PendingOperation {
  id: number;                 // 自增ID
  operation_type: 'add' | 'update' | 'delete';
  entity_type: 'record' | 'food' | 'goal' | 'preference';
  local_id: string;           // 关联的本地ID
  payload: string;            // 操作数据（JSON字符串）
  created_at: number;         // 操作创建时间
  retry_count: number;        // 重试次数
}

// 数据库 schema 版本
export const DB_VERSION = 1;

// 数据库名称
export const DB_NAME = 'CalorieTrackerDB';

