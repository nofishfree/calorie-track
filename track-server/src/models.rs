use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};

// ============ 用户相关模型 ============

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub avatar: Option<String>,  // 头像哈希值（SHA-256）
    pub is_admin: bool,
    pub created_at: DateTime<Utc>,
    pub data_version: i64,
}

// ============ 头像相关模型 ============

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Avatar {
    pub id: Uuid,
    pub hash: String,           // SHA-256 哈希值（64位十六进制）
    pub data: String,           // base64 编码的头像数据
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UploadAvatarRequest {
    pub hash: String,           // SHA-256 哈希值
    pub data: String,           // base64 编码的头像数据
}

#[derive(Debug, Serialize)]
pub struct UploadAvatarResponse {
    pub hash: String,
    pub success: bool,
}

#[derive(Debug, Serialize)]
pub struct CheckAvatarResponse {
    pub exists: bool,
    pub hash: Option<String>,   // 如果不存在，返回哈希值供前端上传
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub password: String,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub email: String,
    pub code: String,
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

// ============ 食物相关模型 ============

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Food {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub num: f64,
    pub calorie: f64,
    pub calorie_unit: String,
    pub carbs_g: f64,
    pub protein_g: f64,
    pub fat_g: f64,
    pub unit: String,
    pub usage_count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FoodData {
    pub id: String,
    pub name: String,
    pub num: f64,
    pub calorie: f64,
    pub calorie_unit: String,
    pub carbs_g: f64,
    pub protein_g: f64,
    pub fat_g: f64,
    pub unit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFoodRequest {
    pub id: String,
    pub name: String,
    pub num: f64,
    pub unit: String,
    pub calorie: f64,
    pub calorie_unit: String,
    pub carbs_g: f64,
    pub protein_g: f64,
    pub fat_g: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFoodRequest {
    pub name: Option<String>,
    pub num: Option<f64>,
    pub calorie: Option<f64>,
    pub calorie_unit: Option<String>,
    pub carbs_g: Option<f64>,
    pub protein_g: Option<f64>,
    pub fat_g: Option<f64>,
    pub unit: Option<String>,
}

// ============ 饮食记录相关模型 ============

#[derive(Debug, Deserialize)]
pub struct CreateMealRecordRequest {
    pub food_id: Option<Uuid>,
    pub food: FoodData,
    pub serving_count: f64,
    pub record_time: DateTime<Utc>,
    pub calories_total: f64,
    pub carbs_total: f64,
    pub protein_total: f64,
    pub fat_total: f64,
    pub plan_id: Option<Uuid>,
    pub plan_name: Option<String>,
    pub plan_items: Option<Vec<PlanItemData>>,
    pub is_quick_add: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMealRecordRequest {
    pub food_id: Option<Uuid>,
    pub food: Option<FoodData>,
    pub serving_count: Option<f64>,
    pub record_time: Option<DateTime<Utc>>,
    pub calories_total: Option<f64>,
    pub carbs_total: Option<f64>,
    pub protein_total: Option<f64>,
    pub fat_total: Option<f64>,
    pub plan_id: Option<Uuid>,
    pub plan_name: Option<String>,
    pub plan_items: Option<Vec<PlanItemData>>,
    pub is_quick_add: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanItemData {
    pub food_id: String,
    pub food: FoodData,
    pub quantity: f64,
}

#[derive(Debug, Serialize)]
pub struct MealRecordResponse {
    pub id: Uuid,
    pub food_id: Option<Uuid>,
    pub food: FoodData,
    pub serving_count: f64,
    pub record_time: DateTime<Utc>,
    pub calories_total: f64,
    pub carbs_total: f64,
    pub protein_total: f64,
    pub fat_total: f64,
    pub plan_id: Option<Uuid>,
    pub plan_name: Option<String>,
    pub plan_items: Option<Vec<PlanItemData>>,
    pub is_quick_add: bool,
}

// ============ 套餐相关模型 ============

#[derive(Debug, Deserialize)]
pub struct CreatePlanRequest {
    pub name: String,
    pub items: Vec<PlanItemRequest>,
}

#[derive(Debug, Deserialize)]
pub struct PlanItemRequest {
    pub food_id: Uuid,
    pub food: FoodData,
    pub quantity: f64,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlanRequest {
    pub name: Option<String>,
    pub items: Option<Vec<PlanItemRequest>>,
}

#[derive(Debug, Serialize)]
pub struct PlanItemResponse {
    pub id: Uuid,
    pub food_id: Uuid,
    pub food: FoodData,
    pub quantity: f64,
    pub sort_order: i32,
}

#[derive(Debug, Serialize)]
pub struct MealPlanResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub items: Vec<PlanItemResponse>,
    pub created_at: DateTime<Utc>,
}

// ============ 目标模板相关模型 ============

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct GoalTemplate {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    #[serde(rename = "type")]
    #[sqlx(rename = "type")]
    pub template_type: String,
    pub cycle_days: i32,
    pub today_index: i32,
    pub daily_goals: serde_json::Value,
    pub is_current: bool,
    pub last_active_date: Option<chrono::NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateGoalTemplateRequest {
    pub name: String,
    #[serde(rename = "type", default = "default_template_type")]
    pub template_type: String,
    #[serde(default = "default_cycle_days")]
    pub cycle_days: i32,
    #[serde(default)]
    pub today_index: i32,
    pub daily_goals: serde_json::Value,
    #[serde(default)]
    pub last_active_date: Option<chrono::NaiveDate>,
}

fn default_template_type() -> String {
    "daily".to_string()
}

fn default_cycle_days() -> i32 {
    1
}

#[derive(Debug, Deserialize)]
pub struct UpdateGoalTemplateRequest {
    pub name: Option<String>,
    pub template_type: Option<String>,
    pub cycle_days: Option<i32>,
    pub today_index: Option<i32>,
    pub daily_goals: Option<serde_json::Value>,
    pub is_current: Option<bool>,
    pub last_active_date: Option<Option<chrono::NaiveDate>>,
}

// ============ 用户信息响应 ============

#[derive(Debug, Serialize)]
pub struct UserMeResponse {
    pub id: Uuid,
    pub email: String,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub data_version: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>,
    pub avatar: Option<String>,
}

// ============ 操作日志相关模型 ============

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct OperationLog {
    pub id: Uuid,
    pub user_id: Uuid,
    pub serial_number: i64,
    pub operation_type: String,
    pub entity_type: String,
    pub data: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SyncOperationRequest {
    /// 操作唯一 ID（UUID v4，由前端生成，用于去重和写入 operation_logs.id）
    pub id: Uuid,
    pub operation_type: String,
    pub entity_type: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct SyncOperationResponse {
    pub success: bool,
    pub serial_number: i64,
}

#[derive(Debug, Deserialize)]
pub struct SyncChangesQuery {
    pub serial_number: i64,
}

#[derive(Debug, Serialize)]
pub struct SyncChangesResponse {
    pub latest_serial: i64,
    pub operations: Vec<OperationLog>,
}

// ============ 版本化同步模型 ============

#[derive(Debug, Deserialize)]
pub struct VersionedSyncRequest {
    pub client_version: i64,
    pub head_operation: Option<SyncOperationRequest>,
}

#[derive(Debug, Serialize)]
pub struct VersionedSyncResponse {
    pub server_version: i64,
    pub operations: Vec<OperationLog>,
    pub head_processed: bool,
    pub missing_avatar_hash: Option<String>,  // 如果头像哈希值不存在于数据库，返回给前端
}

// ============ 通用响应模型 ============

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub data: T,
}

#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_defaults_and_optional_fields_serde() {
        let request: CreateGoalTemplateRequest = serde_json::from_value(serde_json::json!({
            "name": "Daily",
            "daily_goals": [{ "calorie_target": 2000 }]
        }))
        .expect("goal template request");
        assert_eq!(request.template_type, "daily");
        assert_eq!(request.cycle_days, 1);
        assert_eq!(request.today_index, 0);
        assert!(request.last_active_date.is_none());

        let food: FoodData = serde_json::from_value(serde_json::json!({
            "id": "food-1",
            "name": "Rice",
            "num": 100,
            "calorie": 130,
            "calorie_unit": "kcal",
            "carbs_g": 28,
            "protein_g": 2.7,
            "fat_g": 0.3,
            "unit": "g"
        }))
        .expect("food data");
        assert_eq!(food.user_id, None);
        assert!(!serde_json::to_value(&food).unwrap().as_object().unwrap().contains_key("user_id"));
    }

    #[test]
    fn serde_preserves_custom_type_name_and_optional_request_values() {
        let request: CreateGoalTemplateRequest = serde_json::from_value(serde_json::json!({
            "name": "Cycle",
            "type": "cycle",
            "cycle_days": 7,
            "today_index": 3,
            "daily_goals": []
        }))
        .unwrap();
        assert_eq!(request.template_type, "cycle");
        assert_eq!(request.cycle_days, 7);
        assert_eq!(request.today_index, 3);

        let update: UpdateGoalTemplateRequest = serde_json::from_value(serde_json::json!({
            "template_type": "daily",
            "last_active_date": null
        }))
        .unwrap();
        assert_eq!(update.template_type.as_deref(), Some("daily"));
        assert!(update.last_active_date.is_none());
    }
}
