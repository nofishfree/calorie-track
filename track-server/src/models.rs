use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use validator::Validate;

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

#[derive(Debug, Deserialize, Validate)]
pub struct UploadAvatarRequest {
    #[validate(length(min = 64, max = 64))]
    pub hash: String,           // SHA-256 哈希值
    #[validate(length(min = 1))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 6))]
    pub password: String,
    #[validate(length(min = 1, max = 50))]
    pub username: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 6))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct ForgotPasswordRequest {
    #[validate(email)]
    pub email: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ResetPasswordRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 6, max = 6))]
    pub code: String,
    #[validate(length(min = 6))]
    pub new_password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 6))]
    pub old_password: String,
    #[validate(length(min = 6))]
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

#[derive(Debug, Serialize, Deserialize, Clone, Validate)]
pub struct FoodData {
    #[validate(length(min = 1))]
    pub id: String,
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    #[validate(range(min = 0.0))]
    pub num: f64,
    #[validate(range(min = 0.0))]
    pub calorie: f64,
    #[validate(length(min = 1))]
    pub calorie_unit: String,
    #[validate(range(min = 0.0))]
    pub carbs_g: f64,
    #[validate(range(min = 0.0))]
    pub protein_g: f64,
    #[validate(range(min = 0.0))]
    pub fat_g: f64,
    #[validate(length(min = 1))]
    pub unit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CreateFoodRequest {
    #[validate(length(min = 1))]
    pub id: String,
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    #[validate(range(min = 0.0))]
    pub num: f64,
    #[validate(length(min = 1))]
    pub unit: String,
    #[validate(range(min = 0.0))]
    pub calorie: f64,
    #[validate(length(min = 1))]
    pub calorie_unit: String,
    #[validate(range(min = 0.0))]
    pub carbs_g: f64,
    #[validate(range(min = 0.0))]
    pub protein_g: f64,
    #[validate(range(min = 0.0))]
    pub fat_g: f64,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateFoodRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    #[validate(range(min = 0.0))]
    pub num: Option<f64>,
    #[validate(range(min = 0.0))]
    pub calorie: Option<f64>,
    #[validate(length(min = 1))]
    pub calorie_unit: Option<String>,
    #[validate(range(min = 0.0))]
    pub carbs_g: Option<f64>,
    #[validate(range(min = 0.0))]
    pub protein_g: Option<f64>,
    #[validate(range(min = 0.0))]
    pub fat_g: Option<f64>,
    #[validate(length(min = 1))]
    pub unit: Option<String>,
}

// ============ 饮食记录相关模型 ============

#[derive(Debug, Deserialize, Validate)]
pub struct CreateMealRecordRequest {
    pub food_id: Option<Uuid>,
    #[validate]
    pub food: FoodData,
    #[validate(range(min = 0.0))]
    pub serving_count: f64,
    pub record_time: DateTime<Utc>,
    #[validate(range(min = 0.0))]
    pub calories_total: f64,
    #[validate(range(min = 0.0))]
    pub carbs_total: f64,
    #[validate(range(min = 0.0))]
    pub protein_total: f64,
    #[validate(range(min = 0.0))]
    pub fat_total: f64,
    pub plan_id: Option<Uuid>,
    pub plan_name: Option<String>,
    pub plan_items: Option<Vec<PlanItemData>>,
    pub is_quick_add: Option<bool>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateMealRecordRequest {
    pub food_id: Option<Uuid>,
    #[validate]
    pub food: Option<FoodData>,
    #[validate(range(min = 0.0))]
    pub serving_count: Option<f64>,
    pub record_time: Option<DateTime<Utc>>,
    #[validate(range(min = 0.0))]
    pub calories_total: Option<f64>,
    #[validate(range(min = 0.0))]
    pub carbs_total: Option<f64>,
    #[validate(range(min = 0.0))]
    pub protein_total: Option<f64>,
    #[validate(range(min = 0.0))]
    pub fat_total: Option<f64>,
    pub plan_id: Option<Uuid>,
    pub plan_name: Option<String>,
    pub plan_items: Option<Vec<PlanItemData>>,
    pub is_quick_add: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Validate)]
pub struct PlanItemData {
    #[validate(length(min = 1))]
    pub food_id: String,
    #[validate]
    pub food: FoodData,
    #[validate(range(min = 0.0))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct CreatePlanRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    #[validate(length(min = 1))]
    #[validate]
    pub items: Vec<PlanItemRequest>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct PlanItemRequest {
    pub food_id: Uuid,
    #[validate]
    pub food: FoodData,
    #[validate(range(min = 0.0))]
    pub quantity: f64,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdatePlanRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    #[validate(length(min = 1))]
    #[validate]
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

#[derive(Debug, Deserialize, Validate)]
pub struct CreateGoalTemplateRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    #[serde(rename = "type", default = "default_template_type")]
    pub template_type: String,
    #[serde(default = "default_cycle_days")]
    #[validate(range(min = 1, max = 366))]
    pub cycle_days: i32,
    #[serde(default)]
    #[validate(range(min = 0))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateGoalTemplateRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: Option<String>,
    pub template_type: Option<String>,
    #[validate(range(min = 1, max = 366))]
    pub cycle_days: Option<i32>,
    #[validate(range(min = 0))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateProfileRequest {
    #[validate(length(min = 1, max = 50))]
    pub username: Option<String>,
    #[validate(length(min = 1))]
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

#[derive(Debug, Clone, Deserialize, Validate)]
pub struct SyncOperationRequest {
    /// 操作唯一 ID（UUID v4，由前端生成，用于去重和写入 operation_logs.id）
    pub id: Uuid,
    #[validate(length(min = 1))]
    pub operation_type: String,
    #[validate(length(min = 1))]
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

#[derive(Debug, Deserialize, Validate)]
pub struct VersionedSyncRequest {
    #[validate(range(min = 0))]
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

    fn valid_food_data() -> FoodData {
        FoodData {
            id: "food-1".into(),
            name: "Rice".into(),
            num: 100.0,
            calorie: 130.0,
            calorie_unit: "kcal".into(),
            carbs_g: 28.0,
            protein_g: 2.7,
            fat_g: 0.3,
            unit: "g".into(),
            user_id: None,
        }
    }

    #[test]
    fn validates_auth_email_password_and_code_boundaries() {
        let user = CreateUserRequest {
            email: "user@example.com".into(),
            password: "123456".into(),
            username: Some("User".into()),
        };
        assert!(user.validate().is_ok());

        let invalid_email = CreateUserRequest {
            email: "not-an-email".into(),
            ..user
        };
        assert!(invalid_email.validate().unwrap_err().field_errors().contains_key("email"));

        let short_password = LoginRequest {
            email: "user@example.com".into(),
            password: "12345".into(),
        };
        assert!(short_password.validate().unwrap_err().field_errors().contains_key("password"));
        assert!(LoginRequest {
            email: "user@example.com".into(),
            password: "123456".into(),
        }.validate().is_ok());

        assert!(ForgotPasswordRequest { email: "bad".into() }
            .validate().unwrap_err().field_errors().contains_key("email"));
        assert!(ResetPasswordRequest {
            email: "user@example.com".into(),
            code: "123456".into(),
            new_password: "123456".into(),
        }.validate().is_ok());
        assert!(ResetPasswordRequest {
            email: "user@example.com".into(),
            code: "12345".into(),
            new_password: "123456".into(),
        }.validate().unwrap_err().field_errors().contains_key("code"));
        assert!(ChangePasswordRequest {
            old_password: "123456".into(),
            new_password: "12345".into(),
        }.validate().unwrap_err().field_errors().contains_key("new_password"));
    }

    #[test]
    fn validates_food_and_numeric_boundaries() {
        let food = valid_food_data();
        assert!(food.validate().is_ok());
        assert!(FoodData { num: -0.1, ..food.clone() }
            .validate().unwrap_err().field_errors().contains_key("num"));

        let create = CreateFoodRequest {
            id: "food-1".into(),
            name: "Rice".into(),
            num: 0.0,
            unit: "g".into(),
            calorie: 0.0,
            calorie_unit: "kcal".into(),
            carbs_g: 0.0,
            protein_g: 0.0,
            fat_g: 0.0,
        };
        assert!(create.validate().is_ok());
        assert!(CreateFoodRequest { name: "".into(), ..create }
            .validate().unwrap_err().field_errors().contains_key("name"));
        assert!(UpdateFoodRequest {
            name: Some("".into()),
            num: None,
            calorie: None,
            calorie_unit: None,
            carbs_g: None,
            protein_g: None,
            fat_g: None,
            unit: None,
        }.validate().unwrap_err().field_errors().contains_key("name"));
    }

    #[test]
    fn validates_nested_meal_and_plan_requests() {
        let meal = CreateMealRecordRequest {
            food_id: None,
            food: valid_food_data(),
            serving_count: 0.0,
            record_time: Utc::now(),
            calories_total: 0.0,
            carbs_total: 0.0,
            protein_total: 0.0,
            fat_total: 0.0,
            plan_id: None,
            plan_name: None,
            plan_items: None,
            is_quick_add: Some(false),
        };
        assert!(meal.validate().is_ok());
        assert!(CreateMealRecordRequest {
            serving_count: -1.0,
            ..meal
        }.validate().unwrap_err().field_errors().contains_key("serving_count"));
        assert!(UpdateMealRecordRequest {
            food_id: None,
            food: None,
            serving_count: None,
            record_time: None,
            calories_total: Some(-1.0),
            carbs_total: None,
            protein_total: None,
            fat_total: None,
            plan_id: None,
            plan_name: None,
            plan_items: None,
            is_quick_add: None,
        }.validate().unwrap_err().field_errors().contains_key("calories_total"));

        let item = PlanItemRequest {
            food_id: Uuid::new_v4(),
            food: valid_food_data(),
            quantity: 0.0,
        };
        assert!(item.validate().is_ok());
        assert!(PlanItemRequest {
            quantity: -1.0,
            ..item
        }.validate().unwrap_err().field_errors().contains_key("quantity"));
        assert!(CreatePlanRequest {
            name: "Breakfast".into(),
            items: vec![PlanItemRequest {
                food_id: Uuid::new_v4(),
                food: valid_food_data(),
                quantity: 1.0,
            }],
        }.validate().is_ok());
        assert!(CreatePlanRequest {
            name: "Breakfast".into(),
            items: vec![],
        }.validate().unwrap_err().field_errors().contains_key("items"));
        assert!(PlanItemData {
            food_id: "food-1".into(),
            food: valid_food_data(),
            quantity: 1.0,
        }.validate().is_ok());
        assert!(UpdatePlanRequest {
            name: Some("".into()),
            items: None,
        }.validate().unwrap_err().field_errors().contains_key("name"));
    }

    #[test]
    fn validates_template_profile_sync_and_avatar_requests() {
        let template = CreateGoalTemplateRequest {
            name: "Cycle".into(),
            template_type: "cycle".into(),
            cycle_days: 1,
            today_index: 0,
            daily_goals: serde_json::json!([]),
            last_active_date: None,
        };
        assert!(template.validate().is_ok());
        assert!(CreateGoalTemplateRequest {
            cycle_days: 0,
            ..template
        }.validate().unwrap_err().field_errors().contains_key("cycle_days"));
        assert!(UpdateGoalTemplateRequest {
            name: None,
            template_type: None,
            cycle_days: Some(0),
            today_index: None,
            daily_goals: None,
            is_current: None,
            last_active_date: None,
        }.validate().unwrap_err().field_errors().contains_key("cycle_days"));

        assert!(UpdateProfileRequest {
            username: Some("".into()),
            avatar: None,
        }.validate().unwrap_err().field_errors().contains_key("username"));
        assert!(SyncOperationRequest {
            id: Uuid::new_v4(),
            operation_type: "".into(),
            entity_type: "food".into(),
            data: serde_json::json!({}),
        }.validate().unwrap_err().field_errors().contains_key("operation_type"));
        assert!(VersionedSyncRequest {
            client_version: -1,
            head_operation: None,
        }.validate().unwrap_err().field_errors().contains_key("client_version"));
        assert!(UploadAvatarRequest {
            hash: "a".repeat(64),
            data: "base64".into(),
        }.validate().is_ok());
        assert!(UploadAvatarRequest {
            hash: "short".into(),
            data: "base64".into(),
        }.validate().unwrap_err().field_errors().contains_key("hash"));
    }
}
