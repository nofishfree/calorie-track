use axum::{
    extract::{Path, State},
    response::Json,
};
use sha2::{Digest, Sha256};
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

/// 头像数据（base64）大小上限
const MAX_AVATAR_DATA_LEN: usize = 2 * 1024 * 1024;

/// 校验哈希值为 64 位十六进制字符串
fn validate_hash(hash: &str) -> AppResult<()> {
    if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::Validation("无效的头像哈希值".to_string()));
    }

    Ok(())
}

/// GET /api/avatars/:hash - 根据哈希值获取头像数据
pub async fn get_avatar(
    Path(hash): Path<String>,
    _auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<Avatar>>> {
    validate_hash(&hash)?;

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
    validate_hash(&req.hash)?;

    if req.data.len() > MAX_AVATAR_DATA_LEN {
        return Err(AppError::Validation("头像数据过大".to_string()));
    }

    // 哈希值必须与数据匹配，否则可以用任意内容占用/污染其他用户的头像哈希
    let computed_hash = format!("{:x}", Sha256::digest(req.data.as_bytes()));
    if !computed_hash.eq_ignore_ascii_case(&req.hash) {
        return Err(AppError::Validation("头像哈希值与数据不匹配".to_string()));
    }

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
    _auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<Json<ApiResponse<CheckAvatarResponse>>> {
    validate_hash(&hash)?;

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