use axum::{
    extract::{FromRef, Query, State},
    response::Json,
};
use sqlx::{PgPool, FromRow};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
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

// 全局应用状态（包含数据库连接和操作队列缓存）
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub operation_queues: Arc<Mutex<HashMap<Uuid, Vec<SyncOperationRequest>>>>,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> Self {
        state.pool.clone()
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
    entity_id: &str,
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
        "INSERT INTO operation_logs (id, user_id, serial_number, operation_type, entity_type, entity_id, data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())"
    )
    .bind(log_id)
    .bind(user_id)
    .bind(next_serial)
    .bind(operation_type)
    .bind(entity_type)
    .bind(entity_id)
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
        "SELECT id, user_id, serial_number, operation_type, entity_type, entity_id, data, created_at
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
        &req.entity_id,
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
    let queues = &state.operation_queues;

    // 1. 获取服务器当前数据版本
    let max_serial: MaxSerialRow = sqlx::query_as(
        "SELECT COALESCE(MAX(serial_number), 0) as max_serial FROM operation_logs WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    let server_version = max_serial.max_serial.unwrap_or(0);

    // 2. 如果有队头操作，检查是否已在数据库中
    let mut head_processed = false;
    if let Some(head_op) = &req.head_operation {
        // 检查该操作的 entity_id 是否已在操作日志中
        let exists: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM operation_logs WHERE user_id = $1 AND entity_id = $2)"
        )
        .bind(user_id)
        .bind(&head_op.entity_id)
        .fetch_one(pool)
        .await
        .unwrap_or((false,));

        if !exists.0 {
            // 不在数据库中，加入内存队列缓存
            {
                let mut queues_map = queues.lock().unwrap();
                let user_queue = queues_map.entry(user_id).or_insert_with(Vec::new);
                user_queue.push(head_op.clone());
            }

            // 处理队列中的所有操作（执行数据库操作并记录日志）
            process_operation_queue(pool, user_id, queues.clone()).await?;

            head_processed = true;
        } else {
            // 已在数据库中，标记为已处理
            head_processed = true;
        }
    }

    // 3. 如果服务器版本大于客户端版本，返回增量数据
    let operations = if server_version > client_version {
        sqlx::query_as(
            "SELECT id, user_id, serial_number, operation_type, entity_type, entity_id, data, created_at
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
    };

    Ok(Json(ApiResponse { data: response }))
}

/// 处理用户的操作队列
async fn process_operation_queue(
    pool: &PgPool,
    user_id: Uuid,
    queues: Arc<Mutex<HashMap<Uuid, Vec<SyncOperationRequest>>>>,
) -> AppResult<()> {
    let operations: Vec<SyncOperationRequest> = {
        let mut queues_map = queues.lock().unwrap();
        match queues_map.get_mut(&user_id) {
            Some(q) => q.drain(..).collect(),
            None => return Ok(()),
        }
    };

    // 执行每个操作并记录日志
    for op in operations {
        // 验证操作类型
        let valid_op_types = ["add", "update", "delete"];
        if !valid_op_types.contains(&op.operation_type.as_str()) {
            continue;
        }

        // 验证实体类型
        let valid_entity_types = ["food", "record", "plan", "goal", "account"];
        if !valid_entity_types.contains(&op.entity_type.as_str()) {
            continue;
        }

        // 记录操作日志
        record_operation(
            pool,
            user_id,
            &op.operation_type,
            &op.entity_type,
            &op.entity_id,
            op.data,
        )
        .await?;
    }

    Ok(())
}
