use axum::{
    extract::{State, Json},
    response::Json as AxumJson,
};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;
use serde_json::json;

use crate::auth::AuthContext;
use crate::error::AppResult;
use crate::models::{
    ApiResponse, MessageResponse, UpdateProfileRequest, UserMeResponse,
};
use crate::handlers::sync::record_operation;
use crate::handlers::auth::get_data_version;

#[derive(FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    username: Option<String>,
    avatar_url: Option<String>,
}

pub async fn get_user_me(
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<AxumJson<ApiResponse<UserMeResponse>>> {
    let user: Option<UserRow> = sqlx::query_as(
        "SELECT id, email, username, avatar_url FROM users WHERE id = $1"
    )
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?;

    let user = user.ok_or_else(|| crate::error::AppError::NotFound("用户不存在".to_string()))?;

    let data_version = get_data_version(&pool, auth.user_id).await;

    let response = UserMeResponse {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar_url,
        data_version,
    };
    Ok(AxumJson(ApiResponse { data: response }))
}

pub async fn update_profile(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<UpdateProfileRequest>,
) -> AppResult<AxumJson<ApiResponse<UserMeResponse>>> {
    let user: Option<UserRow> = sqlx::query_as(
        "UPDATE users
        SET username = COALESCE($1, username),
            avatar_url = COALESCE($2, avatar_url)
        WHERE id = $3
        RETURNING id, email, username, avatar_url"
    )
    .bind(req.username)
    .bind(req.avatar)
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?;

    let user = user.ok_or_else(|| crate::error::AppError::NotFound("用户不存在".to_string()))?;

    // 记录操作日志
    record_operation(
        &pool,
        auth.user_id,
        "update",
        "account",
        &user.id.to_string(),
        json!({
            "id": user.id,
            "email": &user.email,
            "username": &user.username,
            "avatar_url": &user.avatar_url,
        }),
    )
    .await?;

    let data_version = get_data_version(&pool, auth.user_id).await;

    let response = UserMeResponse {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar_url,
        data_version,
    };
    Ok(AxumJson(ApiResponse { data: response }))
}

pub async fn delete_user_me(
    auth: AuthContext,
    State(pool): State<PgPool>,
) -> AppResult<AxumJson<MessageResponse>> {
    // 由于外键 ON DELETE CASCADE，删除用户会自动级联删除所有相关数据
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(auth.user_id)
        .execute(&pool)
        .await?;

    Ok(AxumJson(MessageResponse {
        message: "账号删除成功".to_string(),
    }))
}
