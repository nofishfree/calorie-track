use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use chrono::{Duration, Utc};
use serde::Deserialize;
use sqlx::{PgPool, FromRow};
use uuid::Uuid;
use serde_json::json;

use crate::auth::AuthContext;
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, CreateMealRecordRequest, MealRecordResponse, UpdateMealRecordRequest,
};
use crate::handlers::sync::record_operation;

#[derive(Debug, Deserialize)]
pub struct MealRecordQuery {
    pub date: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(FromRow)]
struct MealRecordRow {
    id: Uuid,
    #[allow(dead_code)]
    user_id: Uuid,
    food_id: Option<Uuid>,
    food_data: serde_json::Value,
    serving_count: f64,
    record_time: chrono::DateTime<chrono::Utc>,
    calories_total: f64,
    carbs_total: f64,
    protein_total: f64,
    fat_total: f64,
    plan_id: Option<Uuid>,
    plan_name: Option<String>,
    plan_items: Option<serde_json::Value>,
    is_quick_add: bool,
}

#[derive(FromRow)]
struct RecordUserIdRow {
    user_id: Uuid,
}

pub async fn create_meal_record(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<CreateMealRecordRequest>,
) -> AppResult<Json<ApiResponse<MealRecordResponse>>> {
    let record_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    let is_quick_add = req.is_quick_add.unwrap_or(false);

    let plan_items_json = req.plan_items.as_ref().map(|items| json!(items));

    let row: MealRecordRow = sqlx::query_as(
        "INSERT INTO meal_records (id, user_id, food_id, food_data, serving_count, record_time, calories_total, carbs_total, protein_total, fat_total, plan_id, plan_name, plan_items, is_quick_add, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id, user_id, food_id, food_data, serving_count, record_time, calories_total, carbs_total, protein_total, fat_total, plan_id, plan_name, plan_items, is_quick_add"
    )
    .bind(record_id)
    .bind(auth.user_id)
    .bind(req.food_id)
    .bind(json!(req.food))
    .bind(req.serving_count)
    .bind(req.record_time)
    .bind(req.calories_total)
    .bind(req.carbs_total)
    .bind(req.protein_total)
    .bind(req.fat_total)
    .bind(req.plan_id)
    .bind(&req.plan_name)
    .bind(&plan_items_json)
    .bind(is_quick_add)
    .bind(now)
    .fetch_one(&pool)
    .await?;

    let response = row_to_response(row);

    // 记录操作日志
    record_operation(
        &pool,
        auth.user_id,
        "add",
        "record",
        &response.id.to_string(),
        json!({
            "id": response.id,
            "food_id": response.food_id,
            "food": response.food,
            "serving_count": response.serving_count,
            "record_time": response.record_time,
            "calories_total": response.calories_total,
            "carbs_total": response.carbs_total,
            "protein_total": response.protein_total,
            "fat_total": response.fat_total,
            "plan_id": response.plan_id,
            "plan_name": response.plan_name,
            "plan_items": response.plan_items,
            "is_quick_add": response.is_quick_add,
        }),
    )
    .await?;

    Ok(Json(ApiResponse { data: response }))
}

pub async fn get_meal_records(
    Query(query): Query<MealRecordQuery>,
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Vec<MealRecordResponse>>>> {
    let limit = query.limit.unwrap_or(100).min(500);
    let offset = query.offset.unwrap_or(0);

    let rows = if let Some(date_str) = query.date {
        let date = date_str.parse::<chrono::NaiveDate>()
            .map_err(|_| AppError::Validation("日期格式无效".to_string()))?;

        let start_datetime = date.and_hms_opt(0, 0, 0).unwrap().and_utc();
        let end_datetime = date.and_hms_opt(23, 59, 59).unwrap().and_utc();

        sqlx::query_as::<_, MealRecordRow>(
            "SELECT id, user_id, food_id, food_data, serving_count, record_time, calories_total, carbs_total, protein_total, fat_total, plan_id, plan_name, plan_items, is_quick_add
             FROM meal_records
             WHERE user_id = $1 AND record_time >= $2 AND record_time <= $3
             ORDER BY record_time DESC
             LIMIT $4 OFFSET $5"
        )
        .bind(auth.user_id)
        .bind(start_datetime)
        .bind(end_datetime)
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await?
    } else {
        // 默认查询最近7天
        let start_datetime = Utc::now() - Duration::days(7);

        sqlx::query_as::<_, MealRecordRow>(
            "SELECT id, user_id, food_id, food_data, serving_count, record_time, calories_total, carbs_total, protein_total, fat_total, plan_id, plan_name, plan_items, is_quick_add
             FROM meal_records
             WHERE user_id = $1 AND record_time >= $2
             ORDER BY record_time DESC
             LIMIT $3 OFFSET $4"
        )
        .bind(auth.user_id)
        .bind(start_datetime)
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await?
    };

    let responses: Vec<MealRecordResponse> = rows.into_iter().map(row_to_response).collect();

    Ok(Json(ApiResponse { data: responses }))
}

pub async fn update_meal_record(
    Path(record_id): Path<Uuid>,
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<UpdateMealRecordRequest>,
) -> AppResult<Json<ApiResponse<MealRecordResponse>>> {
    // 检查记录是否存在且属于用户
    let existing_record: Option<RecordUserIdRow> = sqlx::query_as(
        "SELECT user_id FROM meal_records WHERE id = $1"
    )
    .bind(record_id)
    .fetch_optional(&pool)
    .await?;

    let existing_record = existing_record.ok_or_else(|| AppError::NotFound("饮食记录不存在".to_string()))?;

    if existing_record.user_id != auth.user_id {
        return Err(AppError::Auth("无权更新此记录".to_string()));
    }

    let plan_items_json = req.plan_items.as_ref().map(|items| json!(items));

    let row: MealRecordRow = sqlx::query_as(
        "UPDATE meal_records
        SET food_id = COALESCE($1, food_id),
            food_data = COALESCE($2, food_data),
            serving_count = COALESCE($3, serving_count),
            record_time = COALESCE($4, record_time),
            calories_total = COALESCE($5, calories_total),
            carbs_total = COALESCE($6, carbs_total),
            protein_total = COALESCE($7, protein_total),
            fat_total = COALESCE($8, fat_total),
            plan_id = COALESCE($9, plan_id),
            plan_name = COALESCE($10, plan_name),
            plan_items = COALESCE($11, plan_items),
            is_quick_add = COALESCE($12, is_quick_add)
        WHERE id = $13
        RETURNING id, user_id, food_id, food_data, serving_count, record_time, calories_total, carbs_total, protein_total, fat_total, plan_id, plan_name, plan_items, is_quick_add"
    )
    .bind(req.food_id)
    .bind(req.food.as_ref().map(|f| json!(f)))
    .bind(req.serving_count)
    .bind(req.record_time)
    .bind(req.calories_total)
    .bind(req.carbs_total)
    .bind(req.protein_total)
    .bind(req.fat_total)
    .bind(req.plan_id)
    .bind(&req.plan_name)
    .bind(&plan_items_json)
    .bind(req.is_quick_add)
    .bind(record_id)
    .fetch_one(&pool)
    .await?;

    let response = row_to_response(row);

    // 记录操作日志
    record_operation(
        &pool,
        auth.user_id,
        "update",
        "record",
        &response.id.to_string(),
        json!({
            "id": response.id,
            "food_id": response.food_id,
            "food": response.food,
            "serving_count": response.serving_count,
            "record_time": response.record_time,
            "calories_total": response.calories_total,
            "carbs_total": response.carbs_total,
            "protein_total": response.protein_total,
            "fat_total": response.fat_total,
            "plan_id": response.plan_id,
            "plan_name": response.plan_name,
            "plan_items": response.plan_items,
            "is_quick_add": response.is_quick_add,
        }),
    )
    .await?;

    Ok(Json(ApiResponse { data: response }))
}

pub async fn delete_meal_record(
    Path(record_id): Path<Uuid>,
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<crate::models::MessageResponse>> {
    // 检查记录是否存在且属于用户
    let existing_record: Option<RecordUserIdRow> = sqlx::query_as(
        "SELECT user_id FROM meal_records WHERE id = $1"
    )
    .bind(record_id)
    .fetch_optional(&pool)
    .await?;

    let existing_record = existing_record.ok_or_else(|| AppError::NotFound("饮食记录不存在".to_string()))?;

    if existing_record.user_id != auth.user_id {
        return Err(AppError::Auth("无权删除此记录".to_string()));
    }

    sqlx::query("DELETE FROM meal_records WHERE id = $1")
        .bind(record_id)
        .execute(&pool)
        .await?;

    // 记录操作日志
    record_operation(
        &pool,
        auth.user_id,
        "delete",
        "record",
        &record_id.to_string(),
        json!({}),
    )
    .await?;

    Ok(Json(crate::models::MessageResponse {
        message: "饮食记录删除成功".to_string(),
    }))
}

/// 将数据库行转换为响应
fn row_to_response(row: MealRecordRow) -> MealRecordResponse {
    let food: crate::models::FoodData = serde_json::from_value(row.food_data)
        .unwrap_or_else(|_| crate::models::FoodData {
            id: String::new(),
            name: String::new(),
            num: 0.0,
            calorie: 0.0,
            calorie_unit: "kj".to_string(),
            carbs_g: 0.0,
            protein_g: 0.0,
            fat_g: 0.0,
            unit: "g".to_string(),
            user_id: None,
        });

    let plan_items: Option<Vec<crate::models::PlanItemData>> = row
        .plan_items
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    MealRecordResponse {
        id: row.id,
        food_id: row.food_id,
        food,
        serving_count: row.serving_count,
        record_time: row.record_time,
        calories_total: row.calories_total,
        carbs_total: row.carbs_total,
        protein_total: row.protein_total,
        fat_total: row.fat_total,
        plan_id: row.plan_id,
        plan_name: row.plan_name,
        plan_items,
        is_quick_add: row.is_quick_add,
    }
}
