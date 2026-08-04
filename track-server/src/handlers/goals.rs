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
    ApiResponse, CreateGoalTemplateRequest, GoalTemplate, MessageResponse,
    UpdateGoalTemplateRequest,
};
use crate::handlers::sync::record_operation;

/// 默认每日目标（与前端 DEFAULT_DAILY_GOAL 一致）
fn default_daily_goals() -> serde_json::Value {
    json!([
        {
            "calorie_target": 2000,
            "carb_target_g": 250,
            "protein_target_g": 150,
            "fat_target_g": 65
        }
    ])
}

/// 为新注册用户创建默认目标模板
pub async fn create_default_template(pool: &PgPool, user_id: Uuid) -> AppResult<()> {
    let template_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    sqlx::query(
        "INSERT INTO goal_templates (id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"
    )
    .bind(template_id)
    .bind(user_id)
    .bind("默认目标")
    .bind("daily")
    .bind(1)
    .bind(0)
    .bind(default_daily_goals())
    .bind(true)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// GET /api/goal-templates - 获取用户所有目标模板
pub async fn get_goal_templates(
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Vec<GoalTemplate>>>> {
    let templates: Vec<GoalTemplate> = sqlx::query_as(
        "SELECT id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, last_active_date, created_at, updated_at
         FROM goal_templates
         WHERE user_id = $1
         ORDER BY created_at ASC"
    )
    .bind(auth.user_id)
    .fetch_all(&pool)
    .await?;

    Ok(Json(ApiResponse { data: templates }))
}

/// POST /api/goal-templates - 创建目标模板
pub async fn create_goal_template(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<CreateGoalTemplateRequest>,
) -> AppResult<Json<ApiResponse<GoalTemplate>>> {
    let template_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let template: GoalTemplate = sqlx::query_as(
        "INSERT INTO goal_templates (id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, last_active_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10)
         RETURNING id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, last_active_date, created_at, updated_at"
    )
    .bind(template_id)
    .bind(auth.user_id)
    .bind(&req.name)
    .bind(&req.template_type)
    .bind(req.cycle_days)
    .bind(req.today_index)
    .bind(&req.daily_goals)
    .bind(req.last_active_date)
    .bind(now)
    .bind(now)
    .fetch_one(&pool)
    .await?;

    // 记录操作日志（data.id 即为实体 ID）
    record_operation(
        &pool,
        auth.user_id,
        "add",
        "goal",
        json!(template),
    )
    .await?;

    Ok(Json(ApiResponse { data: template }))
}

/// GET /api/goal-templates/:id - 获取单个目标模板
pub async fn get_goal_template(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(template_id): Path<Uuid>,
) -> AppResult<Json<ApiResponse<GoalTemplate>>> {
    let template: Option<GoalTemplate> = sqlx::query_as(
        "SELECT id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, last_active_date, created_at, updated_at
         FROM goal_templates
         WHERE id = $1 AND user_id = $2"
    )
    .bind(template_id)
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?;

    let template = template.ok_or_else(|| AppError::NotFound("目标模板不存在".to_string()))?;

    Ok(Json(ApiResponse { data: template }))
}

/// PUT /api/goal-templates/:id - 更新目标模板
pub async fn update_goal_template(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(template_id): Path<Uuid>,
    Json(req): Json<UpdateGoalTemplateRequest>,
) -> AppResult<Json<ApiResponse<GoalTemplate>>> {
    // 检查模板是否存在且属于当前用户
    #[derive(FromRow)]
    struct OwnerRow { user_id: Uuid }
    let owner: Option<OwnerRow> = sqlx::query_as(
        "SELECT user_id FROM goal_templates WHERE id = $1"
    )
    .bind(template_id)
    .fetch_optional(&pool)
    .await?;

    let owner = owner.ok_or_else(|| AppError::NotFound("目标模板不存在".to_string()))?;
    if owner.user_id != auth.user_id {
        return Err(AppError::Auth("无权更新此目标模板".to_string()));
    }

    // 如果设置为当前模板，先取消其他模板的 is_current
    if req.is_current == Some(true) {
        sqlx::query("UPDATE goal_templates SET is_current = FALSE WHERE user_id = $1")
            .bind(auth.user_id)
            .execute(&pool)
            .await?;
    }

    let now = chrono::Utc::now();
    let template: GoalTemplate = sqlx::query_as(
        "UPDATE goal_templates
         SET name = COALESCE($1, name),
             type = COALESCE($2, type),
             cycle_days = COALESCE($3, cycle_days),
             today_index = COALESCE($4, today_index),
             daily_goals = COALESCE($5, daily_goals),
             is_current = COALESCE($6, is_current),
             last_active_date = COALESCE($7, last_active_date),
             updated_at = $8
         WHERE id = $9
         RETURNING id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, last_active_date, created_at, updated_at"
    )
    .bind(req.name)
    .bind(req.template_type)
    .bind(req.cycle_days)
    .bind(req.today_index)
    .bind(req.daily_goals)
    .bind(req.is_current)
    .bind(req.last_active_date)
    .bind(now)
    .bind(template_id)
    .fetch_one(&pool)
    .await?;

    // 记录操作日志（data.id 即为实体 ID）
    record_operation(
        &pool,
        auth.user_id,
        "update",
        "goal",
        json!(template),
    )
    .await?;

    Ok(Json(ApiResponse { data: template }))
}

/// DELETE /api/goal-templates/:id - 删除目标模板
pub async fn delete_goal_template(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(template_id): Path<Uuid>,
) -> AppResult<Json<MessageResponse>> {
    // 检查模板是否存在且属于当前用户
    #[derive(FromRow)]
    struct OwnerRow { user_id: Uuid, is_current: bool }
    let owner: Option<OwnerRow> = sqlx::query_as(
        "SELECT user_id, is_current FROM goal_templates WHERE id = $1"
    )
    .bind(template_id)
    .fetch_optional(&pool)
    .await?;

    let owner = owner.ok_or_else(|| AppError::NotFound("目标模板不存在".to_string()))?;
    if owner.user_id != auth.user_id {
        return Err(AppError::Auth("无权删除此目标模板".to_string()));
    }

    // 至少保留一个模板
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM goal_templates WHERE user_id = $1")
        .bind(auth.user_id)
        .fetch_one(&pool)
        .await?;
    if count <= 1 {
        return Err(AppError::Validation("至少保留一个目标模板".to_string()));
    }

    sqlx::query("DELETE FROM goal_templates WHERE id = $1")
        .bind(template_id)
        .execute(&pool)
        .await?;

    // 如果删除的是当前模板，将第一个模板设为当前
    if owner.is_current {
        sqlx::query(
            "UPDATE goal_templates SET is_current = TRUE
             WHERE id = (SELECT id FROM goal_templates WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1)"
        )
        .bind(auth.user_id)
        .execute(&pool)
        .await?;
    }

    // 记录操作日志（delete 操作通过 data.id 标识被删除的实体）
    record_operation(
        &pool,
        auth.user_id,
        "delete",
        "goal",
        json!({ "id": template_id.to_string() }),
    )
    .await?;

    Ok(Json(MessageResponse {
        message: "目标模板删除成功".to_string(),
    }))
}

/// PUT /api/goal-templates/:id/current - 设置当前目标模板
pub async fn set_current_goal_template(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Path(template_id): Path<Uuid>,
) -> AppResult<Json<MessageResponse>> {
    // 检查模板是否存在且属于当前用户
    let exists: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM goal_templates WHERE id = $1 AND user_id = $2"
    )
    .bind(template_id)
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?;

    if exists.is_none() {
        return Err(AppError::NotFound("目标模板不存在".to_string()));
    }

    // 取消其他模板的 is_current
    sqlx::query("UPDATE goal_templates SET is_current = FALSE WHERE user_id = $1")
        .bind(auth.user_id)
        .execute(&pool)
        .await?;

    // 设置目标模板为当前
    sqlx::query("UPDATE goal_templates SET is_current = TRUE, updated_at = $2 WHERE id = $1")
        .bind(template_id)
        .bind(chrono::Utc::now())
        .execute(&pool)
        .await?;

    Ok(Json(MessageResponse {
        message: "当前目标模板设置成功".to_string(),
    }))
}
