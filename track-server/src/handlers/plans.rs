use axum::{
    extract::{Path, State},
    response::Json,
};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;
use serde_json::json;

use crate::auth::AuthContext;
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, CreatePlanRequest, MealPlanResponse, PlanItemResponse,
    UpdatePlanRequest,
};
use crate::handlers::sync::record_operation;

#[derive(FromRow)]
struct MealPlanRow {
    id: Uuid,
    user_id: Uuid,
    name: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(FromRow)]
struct PlanItemRow {
    id: Uuid,
    #[allow(dead_code)]
    plan_id: Uuid,
    food_id: Uuid,
    food_data: serde_json::Value,
    quantity: f64,
    sort_order: i32,
}

#[derive(FromRow)]
struct PlanUserIdRow {
    #[allow(dead_code)]
    user_id: Uuid,
}

pub async fn get_plans(
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Vec<MealPlanResponse>>>> {
    let plans = sqlx::query_as::<_, MealPlanRow>(
        "SELECT id, user_id, name, created_at
         FROM meal_plans WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    let mut response = Vec::new();
    for plan in plans {
        let items = sqlx::query_as::<_, PlanItemRow>(
            "SELECT id, plan_id, food_id, food_data, quantity, sort_order
             FROM plan_items WHERE plan_id = $1 ORDER BY sort_order"
        )
        .bind(plan.id)
        .fetch_all(&pool)
        .await?;

        response.push(MealPlanResponse {
            id: plan.id,
            user_id: plan.user_id,
            name: plan.name,
            items: items.into_iter().map(row_to_item_response).collect(),
            created_at: plan.created_at,
        });
    }

    Ok(Json(ApiResponse { data: response }))
}

pub async fn get_plan(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(plan_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<MealPlanResponse>>> {
    let plan = sqlx::query_as::<_, MealPlanRow>(
        "SELECT id, user_id, name, created_at
         FROM meal_plans WHERE id = $1 AND user_id = $2"
    )
    .bind(plan_id)
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound("套餐不存在".to_string()))?;

    let items = sqlx::query_as::<_, PlanItemRow>(
        "SELECT id, plan_id, food_id, food_data, quantity, sort_order
         FROM plan_items WHERE plan_id = $1 ORDER BY sort_order"
    )
    .bind(plan_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(ApiResponse {
        data: MealPlanResponse {
            id: plan.id,
            user_id: plan.user_id,
            name: plan.name,
            items: items.into_iter().map(row_to_item_response).collect(),
            created_at: plan.created_at,
        },
    }))
}

pub async fn create_plan(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(payload): Json<CreatePlanRequest>,
) -> AppResult<Json<ApiResponse<MealPlanResponse>>> {
    let plan_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let mut tx = pool.begin().await?;

    // 创建套餐
    sqlx::query(
        "INSERT INTO meal_plans (id, user_id, name, created_at)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(plan_id)
    .bind(auth.user_id)
    .bind(&payload.name)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    // 添加套餐项
    for (index, item) in payload.items.iter().enumerate() {
        let item_id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO plan_items (id, plan_id, food_id, food_data, quantity, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(item_id)
        .bind(plan_id)
        .bind(item.food_id)
        .bind(json!(item.food))
        .bind(item.quantity)
        .bind(index as i32)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    // 记录操作日志
    let plan_response = get_plan_inner(&pool, auth.user_id, plan_id).await?;
    record_operation(
        &pool,
        auth.user_id,
        "add",
        "plan",
        &plan_id.to_string(),
        json!(plan_response),
    )
    .await?;

    Ok(Json(ApiResponse { data: plan_response }))
}

pub async fn update_plan(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(plan_id): Path<Uuid>,
    Json(payload): Json<UpdatePlanRequest>,
) -> AppResult<Json<ApiResponse<MealPlanResponse>>> {
    // 检查套餐是否存在且属于当前用户
    sqlx::query_as::<_, PlanUserIdRow>(
        "SELECT user_id FROM meal_plans WHERE id = $1 AND user_id = $2"
    )
    .bind(plan_id)
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound("套餐不存在".to_string()))?;

    let mut tx = pool.begin().await?;

    // 更新套餐名称
    if let Some(name) = payload.name {
        sqlx::query("UPDATE meal_plans SET name = $1 WHERE id = $2")
            .bind(&name)
            .bind(plan_id)
            .execute(&mut *tx)
            .await?;
    }

    // 更新套餐项
    if let Some(items) = payload.items {
        // 删除旧的项
        sqlx::query("DELETE FROM plan_items WHERE plan_id = $1")
            .bind(plan_id)
            .execute(&mut *tx)
            .await?;

        // 添加新项
        for (index, item) in items.iter().enumerate() {
            let item_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO plan_items (id, plan_id, food_id, food_data, quantity, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6)"
            )
            .bind(item_id)
            .bind(plan_id)
            .bind(item.food_id)
            .bind(json!(item.food))
            .bind(item.quantity)
            .bind(index as i32)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    // 记录操作日志
    let plan_response = get_plan_inner(&pool, auth.user_id, plan_id).await?;
    record_operation(
        &pool,
        auth.user_id,
        "update",
        "plan",
        &plan_id.to_string(),
        json!(plan_response),
    )
    .await?;

    Ok(Json(ApiResponse { data: plan_response }))
}

pub async fn delete_plan(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(plan_id): Path<Uuid>,
) -> AppResult<Json<crate::models::MessageResponse>> {
    // 检查套餐是否存在且属于当前用户
    sqlx::query_as::<_, PlanUserIdRow>(
        "SELECT user_id FROM meal_plans WHERE id = $1 AND user_id = $2"
    )
    .bind(plan_id)
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound("套餐不存在".to_string()))?;

    sqlx::query("DELETE FROM meal_plans WHERE id = $1")
        .bind(plan_id)
        .execute(&pool)
        .await?;

    // 记录操作日志
    record_operation(
        &pool,
        auth.user_id,
        "delete",
        "plan",
        &plan_id.to_string(),
        json!({}),
    )
    .await?;

    Ok(Json(crate::models::MessageResponse {
        message: "套餐删除成功".to_string(),
    }))
}

/// 内部辅助函数：获取套餐详情
async fn get_plan_inner(
    pool: &PgPool,
    user_id: Uuid,
    plan_id: Uuid,
) -> AppResult<MealPlanResponse> {
    let plan = sqlx::query_as::<_, MealPlanRow>(
        "SELECT id, user_id, name, created_at
         FROM meal_plans WHERE id = $1 AND user_id = $2"
    )
    .bind(plan_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("套餐不存在".to_string()))?;

    let items = sqlx::query_as::<_, PlanItemRow>(
        "SELECT id, plan_id, food_id, food_data, quantity, sort_order
         FROM plan_items WHERE plan_id = $1 ORDER BY sort_order"
    )
    .bind(plan_id)
    .fetch_all(pool)
    .await?;

    Ok(MealPlanResponse {
        id: plan.id,
        user_id: plan.user_id,
        name: plan.name,
        items: items.into_iter().map(row_to_item_response).collect(),
        created_at: plan.created_at,
    })
}

/// 将数据库行转换为套餐项响应
fn row_to_item_response(row: PlanItemRow) -> PlanItemResponse {
    let food_data: crate::models::FoodData = serde_json::from_value(row.food_data)
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

    PlanItemResponse {
        id: row.id,
        food_id: row.food_id,
        food: food_data,
        quantity: row.quantity,
        sort_order: row.sort_order,
    }
}
