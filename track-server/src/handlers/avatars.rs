use axum::{
    extract::{Path, State},
    response::Json,
};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, UploadAvatarRequest, UploadAvatarResponse, CheckAvatarResponse,
    Avatar,
};

#[derive(FromRow)]
struct AvatarRow {
    id: Uuid,
    hash: String,
    data: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

/// GET /api/avatars/:hash - 根据哈希值获取头像数据
pub async fn get_avatar(
    Path(hash): Path<String>,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Avatar>>> {
    let avatar: Option<AvatarRow> = sqlx::query_as(
        "SELECT id, hash, data, created_at FROM avatars WHERE hash = $1"
    )
    .bind(&hash)
    .fetch_optional(&pool)
    .await?;

    let avatar = avatar.ok_or_else(|| AppError::NotFound("头像不存在".to_string()))?;

    Ok(Json(ApiResponse {
        data: Avatar {
            id: avatar.id,
            hash: avatar.hash,
            data: avatar.data,
            created_at: avatar.created_at,
        },
    }))
}

/// POST /api/avatars - 上传头像
pub async fn upload_avatar(
    _auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<UploadAvatarRequest>,
) -> AppResult<Json<ApiResponse<UploadAvatarResponse>>> {
    // 检查头像是否已存在
    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT hash FROM avatars WHERE hash = $1"
    )
    .bind(&req.hash)
    .fetch_optional(&pool)
    .await?;

    if exists.is_some() {
        return Ok(Json(ApiResponse {
            data: UploadAvatarResponse {
                hash: req.hash,
                success: true,
            },
        }));
    }

    // 插入新头像
    let avatar_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO avatars (id, hash, data, created_at) VALUES ($1, $2, $3, NOW())"
    )
    .bind(avatar_id)
    .bind(&req.hash)
    .bind(&req.data)
    .execute(&pool)
    .await?;

    Ok(Json(ApiResponse {
        data: UploadAvatarResponse {
            hash: req.hash,
            success: true,
        },
    }))
}

/// GET /api/avatars/check/:hash - 检查头像是否存在
pub async fn check_avatar(
    Path(hash): Path<String>,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<CheckAvatarResponse>>> {
    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT hash FROM avatars WHERE hash = $1"
    )
    .bind(&hash)
    .fetch_optional(&pool)
    .await?;

    Ok(Json(ApiResponse {
        data: CheckAvatarResponse {
            exists: exists.is_some(),
            hash: if exists.is_none() { Some(hash) } else { None },
        },
    }))
}