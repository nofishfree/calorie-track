use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;
use serde_json::json;

use crate::auth::AuthContext;
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, CreateFoodRequest, Food, FoodData, UpdateFoodRequest,
};
use crate::handlers::common::{ensure_owner, OwnedEntity};
use crate::handlers::sync::record_operation;

#[derive(Debug, Deserialize)]
pub struct FoodQuery {
    pub q: Option<String>,
    pub page: Option<i64>,
    pub per_page: Option<i64>,
}

pub async fn create_food(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<CreateFoodRequest>,
) -> AppResult<Json<ApiResponse<Food>>> {
    // 使用客户端传来的 ID，解析失败则返回错误
    let food_id = Uuid::parse_str(&req.id)
        .map_err(|_| AppError::Validation("无效的食物 ID 格式".to_string()))?;

    let food: Food = sqlx::query_as(
        "INSERT INTO foods (id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)
        RETURNING id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count"
    )
    .bind(food_id)
    .bind(auth.user_id)
    .bind(&req.name)
    .bind(req.num)
    .bind(req.calorie)
    .bind(&req.calorie_unit)
    .bind(req.carbs_g)
    .bind(req.protein_g)
    .bind(req.fat_g)
    .bind(&req.unit)
    .fetch_one(&pool)
    .await?;

    // 记录操作日志
    let food_data = FoodData::from(&food);
    record_operation(
        &pool,
        auth.user_id,
        "add",
        "food",
        json!(food_data),
    )
    .await?;

    Ok(Json(ApiResponse { data: food }))
}

pub async fn get_foods(
    Query(query): Query<FoodQuery>,
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Vec<Food>>>> {
    let page = query.page.unwrap_or(1).max(1);
    let per_page = query.per_page.unwrap_or(100).min(500);
    let offset = (page - 1) * per_page;

    let foods = if let Some(search) = query.q {
        sqlx::query_as::<_, Food>(
            "SELECT id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count
             FROM foods
             WHERE (user_id = $1 OR user_id IS NULL)
             AND name ILIKE $2
             ORDER BY usage_count DESC NULLS LAST, name ASC
             LIMIT $3 OFFSET $4"
        )
        .bind(auth.user_id)
        .bind(format!("%{}%", search))
        .bind(per_page)
        .bind(offset)
        .fetch_all(&pool)
        .await?
    } else {
        sqlx::query_as::<_, Food>(
            "SELECT id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count
             FROM foods
             WHERE (user_id = $1 OR user_id IS NULL)
             ORDER BY usage_count DESC NULLS LAST, name ASC
             LIMIT $2 OFFSET $3"
        )
        .bind(auth.user_id)
        .bind(per_page)
        .bind(offset)
        .fetch_all(&pool)
        .await?
    };

    Ok(Json(ApiResponse { data: foods }))
}

pub async fn get_food(
    Path(food_id): Path<Uuid>,
    _auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Food>>> {
    let food: Option<Food> = sqlx::query_as(
        "SELECT id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count
         FROM foods WHERE id = $1"
    )
    .bind(food_id)
    .fetch_optional(&pool)
    .await?;

    let food = food.ok_or_else(|| AppError::NotFound("食物不存在".to_string()))?;

    Ok(Json(ApiResponse { data: food }))
}

pub async fn update_food(
    Path(food_id): Path<Uuid>,
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<UpdateFoodRequest>,
) -> AppResult<Json<ApiResponse<Food>>> {
    ensure_owner(&pool, OwnedEntity::Food, food_id, auth.user_id, "更新").await?;

    let food: Food = sqlx::query_as(
        "UPDATE foods
        SET name = COALESCE($1, name),
            num = COALESCE($2, num),
            calorie = COALESCE($3, calorie),
            calorie_unit = COALESCE($4, calorie_unit),
            carbs_g = COALESCE($5, carbs_g),
            protein_g = COALESCE($6, protein_g),
            fat_g = COALESCE($7, fat_g),
            unit = COALESCE($8, unit)
        WHERE id = $9
        RETURNING id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count"
    )
    .bind(&req.name)
    .bind(req.num)
    .bind(req.calorie)
    .bind(&req.calorie_unit)
    .bind(req.carbs_g)
    .bind(req.protein_g)
    .bind(req.fat_g)
    .bind(&req.unit)
    .bind(food_id)
    .fetch_one(&pool)
    .await?;

    // 记录操作日志
    let food_data = FoodData::from(&food);
    record_operation(
        &pool,
        auth.user_id,
        "update",
        "food",
        json!(food_data),
    )
    .await?;

    Ok(Json(ApiResponse { data: food }))
}

pub async fn delete_food(
    Path(food_id): Path<Uuid>,
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<crate::models::MessageResponse>> {
    ensure_owner(&pool, OwnedEntity::Food, food_id, auth.user_id, "删除").await?;

    sqlx::query("DELETE FROM foods WHERE id = $1")
        .bind(food_id)
        .execute(&pool)
        .await?;

    // 记录操作日志（delete 操作通过 data.id 标识被删除的实体）
    record_operation(
        &pool,
        auth.user_id,
        "delete",
        "food",
        json!({ "id": food_id.to_string() }),
    )
    .await?;

    Ok(Json(crate::models::MessageResponse {
        message: "食物删除成功".to_string(),
    }))
}
