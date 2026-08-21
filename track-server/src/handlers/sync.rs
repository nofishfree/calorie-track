use axum::{
    extract::{FromRef, Query, State},
    response::Json,
};
use sqlx::{FromRow, PgPool, Transaction};
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, OperationLog, SyncChangesQuery, SyncChangesResponse,
    SyncOperationRequest, SyncOperationResponse, VersionedSyncRequest, VersionedSyncResponse,
};

#[derive(FromRow)]
struct MaxSerialRow {
    max_serial: Option<i64>,
}

// 全局应用状态
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub jwt_secret: String,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
    }
}

impl FromRef<AppState> for String {
    fn from_ref(state: &AppState) -> Self {
        state.jwt_secret.clone()
    }
}

impl std::ops::Deref for AppState {
    type Target = PgPool;
    fn deref(&self) -> &Self::Target {
        &self.pool
    }
}

/// 记录操作日志到 operation_logs 表
pub async fn record_operation(
    pool: &PgPool,
    user_id: Uuid,
    operation_type: &str,
    entity_type: &str,
    data: serde_json::Value,
) -> AppResult<()> {
    // 获取当前用户最大序列号
    let max_serial: MaxSerialRow = sqlx::query_as(
        "SELECT COALESCE(MAX(serial_number), 0) as max_serial FROM operation_logs WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    let next_serial = max_serial.max_serial.unwrap_or(0) + 1;
    let log_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO operation_logs (id, user_id, serial_number, operation_type, entity_type, data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())"
    )
    .bind(log_id)
    .bind(user_id)
    .bind(next_serial)
    .bind(operation_type)
    .bind(entity_type)
    .bind(&data)
    .execute(pool)
    .await?;

    Ok(())
}

/// GET /api/sync/changes - 获取增量操作日志
pub async fn get_sync_changes(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Query(query): Query<SyncChangesQuery>,
) -> AppResult<Json<ApiResponse<SyncChangesResponse>>> {
    let client_serial = query.serial_number;

    // 获取最新序列号
    let max_serial: MaxSerialRow = sqlx::query_as(
        "SELECT COALESCE(MAX(serial_number), 0) as max_serial FROM operation_logs WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_one(&pool)
    .await?;

    let latest_serial = max_serial.max_serial.unwrap_or(0);

    // 获取客户端序列号之后的所有操作
    let operations: Vec<OperationLog> = sqlx::query_as(
        "SELECT id, user_id, serial_number, operation_type, entity_type, data, created_at
         FROM operation_logs
         WHERE user_id = $1 AND serial_number > $2
         ORDER BY serial_number ASC"
    )
    .bind(auth.user_id)
    .bind(client_serial)
    .fetch_all(&pool)
    .await?;

    let response = SyncChangesResponse {
        latest_serial,
        operations,
    };

    Ok(Json(ApiResponse { data: response }))
}

/// POST /api/sync/operation - 上传单个操作
pub async fn upload_sync_operation(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<SyncOperationRequest>,
) -> AppResult<Json<ApiResponse<SyncOperationResponse>>> {
    // 验证操作类型
    let valid_op_types = ["add", "update", "delete"];
    if !valid_op_types.contains(&req.operation_type.as_str()) {
        return Err(AppError::Validation(format!(
            "无效的操作类型: {}",
            req.operation_type
        )));
    }

    // 验证实体类型
    let valid_entity_types = ["food", "record", "plan", "goal", "account"];
    if !valid_entity_types.contains(&req.entity_type.as_str()) {
        return Err(AppError::Validation(format!(
            "无效的实体类型: {}",
            req.entity_type
        )));
    }

    // 记录操作日志
    record_operation(
        &pool,
        auth.user_id,
        &req.operation_type,
        &req.entity_type,
        req.data,
    )
    .await?;

    // 获取新序列号
    let max_serial: MaxSerialRow = sqlx::query_as(
        "SELECT COALESCE(MAX(serial_number), 0) as max_serial FROM operation_logs WHERE user_id = $1"
    )
    .bind(auth.user_id)
    .fetch_one(&pool)
    .await?;

    let serial_number = max_serial.max_serial.unwrap_or(0);

    let response = SyncOperationResponse {
        success: true,
        serial_number,
    };

    Ok(Json(ApiResponse { data: response }))
}

/// POST /api/sync/versioned - 版本化同步接口
pub async fn versioned_sync(
    auth: AuthContext,
    State(state): State<AppState>,
    Json(req): Json<VersionedSyncRequest>,
) -> AppResult<Json<ApiResponse<VersionedSyncResponse>>> {
    let user_id = auth.user_id;
    let client_version = req.client_version;
    let pool = &state.pool;
    let mut head_processed = false;
    let mut head_rejected = None;

    if let Some(head_op) = &req.head_operation {
        let exists: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM operation_logs WHERE user_id = $1 AND id = $2)"
        )
        .bind(user_id)
        .bind(head_op.id)
        .fetch_one(pool)
        .await?;

        if exists.0 {
            head_processed = true;
        } else {
            let mut tx = pool.begin().await?;

            // 锁定用户后再计算序列号，保证同一用户的并发操作串行化。
            sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
                .bind(user_id)
                .fetch_one(&mut *tx)
                .await?;

            let already_recorded: (bool,) = sqlx::query_as(
                "SELECT EXISTS(SELECT 1 FROM operation_logs WHERE user_id = $1 AND id = $2)"
            )
            .bind(user_id)
            .bind(head_op.id)
            .fetch_one(&mut *tx)
            .await?;

            if already_recorded.0 {
                tx.commit().await?;
                head_processed = true;
            } else {
                let max_serial: MaxSerialRow = sqlx::query_as(
                    "SELECT COALESCE(MAX(serial_number), 0) as max_serial
                     FROM operation_logs WHERE user_id = $1"
                )
                .bind(user_id)
                .fetch_one(&mut *tx)
                .await?;
                let next_serial = max_serial.max_serial.unwrap_or(0) + 1;

                match execute_operation(&mut tx, user_id, head_op).await {
                    Ok(()) => {
                        sqlx::query(
                            "INSERT INTO operation_logs
                             (id, user_id, serial_number, operation_type, entity_type, data, created_at)
                             VALUES ($1, $2, $3, $4, $5, $6, NOW())",
                        )
                        .bind(head_op.id)
                        .bind(user_id)
                        .bind(next_serial)
                        .bind(&head_op.operation_type)
                        .bind(&head_op.entity_type)
                        .bind(&head_op.data)
                        .execute(&mut *tx)
                        .await?;
                        tx.commit().await?;
                        head_processed = true;
                    }
                    Err(OperationError::Permanent(reason)) => {
                        tx.rollback().await?;
                        head_rejected = Some(reason);
                    }
                    Err(OperationError::Transient(error)) => {
                        tx.rollback().await?;
                        return Err(error.into());
                    }
                }
            }
        }
    }

    let max_serial: MaxSerialRow = sqlx::query_as(
        "SELECT COALESCE(MAX(serial_number), 0) as max_serial FROM operation_logs WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let server_version = max_serial.max_serial.unwrap_or(0);

    let operations = if server_version > client_version {
        sqlx::query_as(
            "SELECT id, user_id, serial_number, operation_type, entity_type, data, created_at
             FROM operation_logs
             WHERE user_id = $1 AND serial_number > $2
             ORDER BY serial_number ASC"
        )
        .bind(user_id)
        .bind(client_version)
        .fetch_all(pool)
        .await?
    } else {
        Vec::new()
    };

    let response = VersionedSyncResponse {
        server_version,
        operations,
        head_processed,
        head_rejected,
        missing_avatar_hash: None,
    };

    Ok(Json(ApiResponse { data: response }))
}

enum OperationError {
    Permanent(String),
    Transient(sqlx::Error),
}

impl From<sqlx::Error> for OperationError {
    fn from(error: sqlx::Error) -> Self {
        Self::Transient(error)
    }
}

/// 执行业务操作：根据 entity_type 和 operation_type 写入数据库
async fn execute_operation(
    tx: &mut Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
    op: &SyncOperationRequest,
) -> Result<(), OperationError> {
    // 从 data.id 提取实体 ID
    let id_str = op
        .data
        .get("id")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| OperationError::Permanent("缺少有效的 data.id".to_string()))?;
    let id = Uuid::parse_str(id_str)
        .map_err(|_| OperationError::Permanent("无效的 data.id".to_string()))?;

    match (op.entity_type.as_str(), op.operation_type.as_str()) {
        // ============ Food 操作 ============
        ("food", "add") => {
            sqlx::query(
                "INSERT INTO foods (id, user_id, name, num, calorie, calorie_unit, carbs_g, protein_g, fat_g, unit, usage_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0)"
            )
            .bind(id)
            .bind(user_id)
            .bind(op.data["name"].as_str().unwrap_or(""))
            .bind(op.data["num"].as_f64().unwrap_or(0.0))
            .bind(op.data["calorie"].as_f64().unwrap_or(0.0))
            .bind(op.data["calorie_unit"].as_str().unwrap_or("kj"))
            .bind(op.data["carbs_g"].as_f64().unwrap_or(0.0))
            .bind(op.data["protein_g"].as_f64().unwrap_or(0.0))
            .bind(op.data["fat_g"].as_f64().unwrap_or(0.0))
            .bind(op.data["unit"].as_str().unwrap_or("g"))
            .execute(&mut **tx)
            .await?;
        }
        ("food", "update") => {
            sqlx::query(
                "UPDATE foods
                SET name = COALESCE($1, name),
                    num = COALESCE($2, num),
                    calorie = COALESCE($3, calorie),
                    calorie_unit = COALESCE($4, calorie_unit),
                    carbs_g = COALESCE($5, carbs_g),
                    protein_g = COALESCE($6, protein_g),
                    fat_g = COALESCE($7, fat_g),
                    unit = COALESCE($8, unit)
                WHERE id = $9 AND user_id = $10"
            )
            .bind(op.data["name"].as_str())
            .bind(op.data["num"].as_f64())
            .bind(op.data["calorie"].as_f64())
            .bind(op.data["calorie_unit"].as_str())
            .bind(op.data["carbs_g"].as_f64())
            .bind(op.data["protein_g"].as_f64())
            .bind(op.data["fat_g"].as_f64())
            .bind(op.data["unit"].as_str())
            .bind(id)
            .bind(user_id)
            .execute(&mut **tx)
            .await?;
        }
        ("food", "delete") => {
            sqlx::query("DELETE FROM foods WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(user_id)
                .execute(&mut **tx)
                .await?;
        }

        // ============ Meal Record 操作 ============
        ("record", "add") => {
            let record_time = op.data["record_time"].as_str()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(chrono::Utc::now);

            let plan_items = Some(&op.data["plan_items"]).filter(|v| !v.is_null());

            sqlx::query(
                "INSERT INTO meal_records (id, user_id, food_id, food_data, serving_count, record_time, calories_total, carbs_total, protein_total, fat_total, plan_id, plan_name, plan_items, is_quick_add, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)"
            )
            .bind(id)
            .bind(user_id)
            .bind(op.data["food_id"].as_str().and_then(|f| Uuid::parse_str(f).ok()))
            .bind(&op.data["food"])
            .bind(op.data["serving_count"].as_f64().unwrap_or(1.0))
            .bind(record_time)
            .bind(op.data["calories_total"].as_f64().unwrap_or(0.0))
            .bind(op.data["carbs_total"].as_f64().unwrap_or(0.0))
            .bind(op.data["protein_total"].as_f64().unwrap_or(0.0))
            .bind(op.data["fat_total"].as_f64().unwrap_or(0.0))
            .bind(op.data["plan_id"].as_str().and_then(|p| Uuid::parse_str(p).ok()))
            .bind(op.data["plan_name"].as_str())
            .bind(plan_items)
            .bind(op.data["is_quick_add"].as_bool().unwrap_or(false))
            .bind(chrono::Utc::now())
            .execute(&mut **tx)
            .await?;
        }
        ("record", "update") => {
            let record_time = op.data["record_time"].as_str()
                .and_then(|t| chrono::DateTime::parse_from_rfc3339(t).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(chrono::Utc::now);

            let plan_items = Some(&op.data["plan_items"]).filter(|v| !v.is_null());

            sqlx::query(
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
                WHERE id = $13 AND user_id = $14"
            )
            .bind(op.data["food_id"].as_str().and_then(|f| Uuid::parse_str(f).ok()))
            .bind(&op.data["food"])
            .bind(op.data["serving_count"].as_f64())
            .bind(record_time)
            .bind(op.data["calories_total"].as_f64())
            .bind(op.data["carbs_total"].as_f64())
            .bind(op.data["protein_total"].as_f64())
            .bind(op.data["fat_total"].as_f64())
            .bind(op.data["plan_id"].as_str().and_then(|p| Uuid::parse_str(p).ok()))
            .bind(op.data["plan_name"].as_str())
            .bind(plan_items)
            .bind(op.data["is_quick_add"].as_bool())
            .bind(id)
            .bind(user_id)
            .execute(&mut **tx)
            .await?;
        }
        ("record", "delete") => {
            sqlx::query("DELETE FROM meal_records WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(user_id)
                .execute(&mut **tx)
                .await?;
        }

        // ============ Plan 操作 ============
        ("plan", "add") => {
            sqlx::query(
                "INSERT INTO meal_plans (id, user_id, name, created_at)
                VALUES ($1, $2, $3, $4)"
            )
            .bind(id)
            .bind(user_id)
            .bind(op.data["name"].as_str().unwrap_or(""))
            .bind(chrono::Utc::now())
            .execute(&mut **tx)
            .await?;

            if let Some(items) = op.data["items"].as_array() {
                for (index, item) in items.iter().enumerate() {
                    let item_id = Uuid::new_v4();
                    sqlx::query(
                        "INSERT INTO plan_items (id, plan_id, food_id, food_data, quantity, sort_order)
                         VALUES ($1, $2, $3, $4, $5, $6)"
                    )
                    .bind(item_id)
                    .bind(id)
                    .bind(item["food_id"].as_str().and_then(|f| Uuid::parse_str(f).ok()))
                    .bind(&item["food"])
                    .bind(item["quantity"].as_f64().unwrap_or(0.0))
                    .bind(index as i32)
                    .execute(&mut **tx)
                    .await?;
                }
            }
        }
        ("plan", "update") => {
            if let Some(name) = op.data["name"].as_str() {
                sqlx::query("UPDATE meal_plans SET name = $1 WHERE id = $2 AND user_id = $3")
                    .bind(name)
                    .bind(id)
                    .bind(user_id)
                    .execute(&mut **tx)
                    .await?;
            }

            if let Some(items) = op.data["items"].as_array() {
                sqlx::query("DELETE FROM plan_items WHERE plan_id = $1")
                    .bind(id)
                    .execute(&mut **tx)
                    .await?;

                for (index, item) in items.iter().enumerate() {
                    let item_id = Uuid::new_v4();
                    sqlx::query(
                        "INSERT INTO plan_items (id, plan_id, food_id, food_data, quantity, sort_order)
                         VALUES ($1, $2, $3, $4, $5, $6)"
                    )
                    .bind(item_id)
                    .bind(id)
                    .bind(item["food_id"].as_str().and_then(|f| Uuid::parse_str(f).ok()))
                    .bind(&item["food"])
                    .bind(item["quantity"].as_f64().unwrap_or(0.0))
                    .bind(index as i32)
                    .execute(&mut **tx)
                    .await?;
                }
            }
        }
        ("plan", "delete") => {
            sqlx::query("DELETE FROM plan_items WHERE plan_id = $1")
                .bind(id)
                .execute(&mut **tx)
                .await?;
            sqlx::query("DELETE FROM meal_plans WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(user_id)
                .execute(&mut **tx)
                .await?;
        }

        // ============ Goal 操作 ============
        ("goal", "add") => {
            sqlx::query(
                "INSERT INTO goal_templates (id, user_id, name, type, cycle_days, today_index, daily_goals, is_current, last_active_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, $9, $10)"
            )
            .bind(id)
            .bind(user_id)
            .bind(op.data["name"].as_str().unwrap_or(""))
            .bind(op.data["type"].as_str().unwrap_or("daily"))
            .bind(op.data["cycle_days"].as_i64().unwrap_or(1) as i32)
            .bind(op.data["today_index"].as_i64().unwrap_or(0) as i32)
            .bind(&op.data["daily_goals"])
            .bind(
                op.data["last_active_date"].as_str()
                    .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
            )
            .bind(chrono::Utc::now())
            .bind(chrono::Utc::now())
            .execute(&mut **tx)
            .await?;
        }
        ("goal", "update") => {
            if op.data["is_current"].as_bool() == Some(true) {
                sqlx::query("UPDATE goal_templates SET is_current = FALSE WHERE user_id = $1")
                    .bind(user_id)
                    .execute(&mut **tx)
                    .await?;
            }

            sqlx::query(
                "UPDATE goal_templates
                 SET name = COALESCE($1, name),
                     type = COALESCE($2, type),
                     cycle_days = COALESCE($3, cycle_days),
                     today_index = COALESCE($4, today_index),
                     daily_goals = COALESCE($5, daily_goals),
                     is_current = COALESCE($6, is_current),
                     last_active_date = COALESCE($7, last_active_date),
                     updated_at = $8
                 WHERE id = $9 AND user_id = $10"
            )
            .bind(op.data["name"].as_str())
            .bind(op.data["type"].as_str())
            .bind(op.data["cycle_days"].as_i64().map(|v| v as i32))
            .bind(op.data["today_index"].as_i64().map(|v| v as i32))
            .bind(&op.data["daily_goals"])
            .bind(op.data["is_current"].as_bool())
            .bind(
                op.data["last_active_date"].as_str()
                    .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
            )
            .bind(chrono::Utc::now())
            .bind(id)
            .bind(user_id)
            .execute(&mut **tx)
            .await?;
        }
        ("goal", "delete") => {
            sqlx::query("DELETE FROM goal_templates WHERE id = $1 AND user_id = $2")
                .bind(id)
                .bind(user_id)
                .execute(&mut **tx)
                .await?;
        }

        // ============ Account 操作 ============
        ("account", "update") => {
            sqlx::query(
                "UPDATE users
                SET username = COALESCE($1, username),
                    avatar_hash = COALESCE($2, avatar_hash)
                WHERE id = $3"
            )
            .bind(op.data["username"].as_str())
            .bind(op.data["avatar"].as_str())
            .bind(user_id)
            .execute(&mut **tx)
            .await?;
        }

        _ => {
            return Err(OperationError::Permanent(
                "不支持的实体类型或操作类型".to_string(),
            ));
        }
    }

    Ok(())
}
