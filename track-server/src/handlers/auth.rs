use axum::{
    extract::State,
    response::Json,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use rand::Rng;
use sqlx::{FromRow, PgPool};
use std::env;
use uuid::Uuid;

use crate::auth::{create_jwt, AuthContext};
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, ChangePasswordRequest, CreateUserRequest, ForgotPasswordRequest,
    LoginRequest, LoginResponse, ResetPasswordRequest, SuccessResponse, UserResponse,
};

#[derive(FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    password_hash: String,
    username: Option<String>,
    avatar_hash: Option<String>,
    is_admin: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

/// 获取用户的数据版本（操作日志数量）
pub async fn get_data_version(pool: &PgPool, user_id: Uuid) -> i64 {
    let count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM operation_logs WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .unwrap_or((0,));
    count.0
}

pub async fn register(
    State(pool): State<PgPool>,
    State(jwt_secret): State<String>,
    Json(req): Json<CreateUserRequest>,
) -> AppResult<Json<ApiResponse<LoginResponse>>> {
    // 检查邮箱是否已注册
    let existing_user = sqlx::query("SELECT id FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(&pool)
        .await?;

    if existing_user.is_some() {
        return Err(AppError::Conflict("该邮箱已被注册".to_string()));
    }

    // 加密密码
    let password_hash = hash(&req.password, DEFAULT_COST)?;

    // 创建用户
    let user_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let user: UserRow = sqlx::query_as(
        "INSERT INTO users (id, email, password_hash, username, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, password_hash, username, avatar_hash, is_admin, created_at"
    )
    .bind(user_id)
    .bind(&req.email)
    .bind(&password_hash)
    .bind(&req.username)
    .bind(now)
    .fetch_one(&pool)
    .await?;

    // 创建用户默认目标模板
    crate::handlers::goals::create_default_template(&pool, user_id).await?;

    let data_version = get_data_version(&pool, user_id).await;

    let token = create_jwt(user_id, &jwt_secret)?;

    let user_response = UserResponse {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar_hash,
        is_admin: user.is_admin,
        created_at: user.created_at,
        data_version,
    };

    let login_response = LoginResponse {
        token,
        user: user_response,
    };

    Ok(Json(ApiResponse { data: login_response }))
}

pub async fn login(
    State(pool): State<PgPool>,
    State(jwt_secret): State<String>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<ApiResponse<LoginResponse>>> {
    // 查找用户
    let user: Option<UserRow> = sqlx::query_as(
        "SELECT id, email, password_hash, username, avatar_hash, is_admin, created_at
         FROM users WHERE email = $1"
    )
    .bind(&req.email)
    .fetch_optional(&pool)
    .await?;

    let user = user.ok_or_else(|| AppError::Auth("邮箱未注册".to_string()))?;

    // 验证密码
    let is_valid = verify(&req.password, &user.password_hash)
        .map_err(|_| AppError::Auth("密码验证失败".to_string()))?;

    if !is_valid {
        return Err(AppError::Auth("密码错误".to_string()));
    }

    // 创建 JWT token
    let token = create_jwt(user.id, &jwt_secret)?;

    let data_version = get_data_version(&pool, user.id).await;

    let user_response = UserResponse {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar_hash,
        is_admin: user.is_admin,
        created_at: user.created_at,
        data_version,
    };

    let login_response = LoginResponse {
        token,
        user: user_response,
    };

    Ok(Json(ApiResponse {
        data: login_response,
    }))
}

pub async fn forgot_password(
    State(pool): State<PgPool>,
    Json(req): Json<ForgotPasswordRequest>,
) -> AppResult<Json<ApiResponse<SuccessResponse>>> {
    let code = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
    let code_hash = hash(&code, DEFAULT_COST)?;
    let user: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(&pool)
        .await?;

    if let Some((user_id,)) = user {
        sqlx::query(
            "UPDATE password_reset_codes
             SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL",
        )
        .bind(user_id)
        .execute(&pool)
        .await?;

        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(15);

        sqlx::query(
            "INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
             VALUES ($1, $2, $3)",
        )
        .bind(user_id)
        .bind(&code_hash)
        .bind(expires_at)
        .execute(&pool)
        .await?;

        // TODO: 接入邮件服务，将验证码发送给用户。
        if env::var("PASSWORD_RESET_DEBUG_LOG").as_deref() == Ok("1") {
            tracing::warn!("Password reset debug code for {}: {}", req.email, code);
        }
    }

    // 为避免泄露邮箱是否注册，统一返回成功。

    Ok(Json(ApiResponse {
        data: SuccessResponse { success: true },
    }))
}

pub async fn reset_password(
    State(pool): State<PgPool>,
    Json(req): Json<ResetPasswordRequest>,
) -> AppResult<Json<ApiResponse<SuccessResponse>>> {
    let mut tx = pool.begin().await?;
    let user: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(&mut *tx)
        .await?;
    let (user_id,) = user.ok_or_else(|| AppError::Validation("验证码无效".to_string()))?;

    let reset_code: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, code_hash
         FROM password_reset_codes
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE",
    )
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let (code_id, code_hash) =
        reset_code.ok_or_else(|| AppError::Validation("验证码无效".to_string()))?;

    let is_valid = verify(&req.code, &code_hash)
        .map_err(|_| AppError::Validation("验证码无效".to_string()))?;
    if !is_valid {
        return Err(AppError::Validation("验证码无效".to_string()));
    }

    let password_hash = hash(&req.new_password, DEFAULT_COST)?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE password_reset_codes
         SET used_at = NOW()
         WHERE id = $1 AND used_at IS NULL",
    )
    .bind(code_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    Ok(Json(ApiResponse {
        data: SuccessResponse { success: true },
    }))
}

pub async fn change_password(
    auth: AuthContext,
    State(pool): State<PgPool>,
    Json(req): Json<ChangePasswordRequest>,
) -> AppResult<Json<ApiResponse<SuccessResponse>>> {
    // 获取当前用户密码哈希
    let user: Option<(String,)> = sqlx::query_as(
        "SELECT password_hash FROM users WHERE id = $1"
    )
    .bind(auth.user_id)
    .fetch_optional(&pool)
    .await?;

    let (password_hash,) = user.ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    // 验证原密码
    let is_valid = verify(&req.old_password, &password_hash)
        .map_err(|_| AppError::Auth("密码验证失败".to_string()))?;

    if !is_valid {
        return Err(AppError::Auth("原密码错误".to_string()));
    }

    // 更新密码
    let new_password_hash = hash(&req.new_password, DEFAULT_COST)?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&new_password_hash)
        .bind(auth.user_id)
        .execute(&pool)
        .await?;

    Ok(Json(ApiResponse {
        data: SuccessResponse { success: true },
    }))
}
