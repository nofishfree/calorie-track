use axum::{
    extract::State,
    response::Json,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use rand::Rng;
use sqlx::{PgPool, FromRow};
use uuid::Uuid;

use crate::auth::{create_jwt, AuthContext};
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiResponse, ChangePasswordRequest, CreateUserRequest, ForgotPasswordRequest,
    LoginRequest, LoginResponse, ResetPasswordRequest, SuccessResponse, UserResponse,
};
use crate::validation::{validate_email, validate_optional_text, validate_password, MAX_USERNAME_LEN};

/// 重置验证码有效期（分钟）
const RESET_CODE_TTL_MINUTES: i64 = 15;

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
    Json(req): Json<CreateUserRequest>,
) -> AppResult<Json<ApiResponse<LoginResponse>>> {
    let email = validate_email(&req.email)?;
    validate_password(&req.password)?;
    validate_optional_text(req.username.as_ref(), MAX_USERNAME_LEN, "用户名")?;

    // 检查邮箱是否已注册
    let existing_user = sqlx::query("SELECT id FROM users WHERE email = $1")
        .bind(&email)
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
    .bind(&email)
    .bind(&password_hash)
    .bind(&req.username)
    .bind(now)
    .fetch_one(&pool)
    .await?;

    // 创建用户默认目标模板
    crate::handlers::goals::create_default_template(&pool, user_id).await?;

    let data_version = get_data_version(&pool, user_id).await;

    let token = create_jwt(user_id)?;

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
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<ApiResponse<LoginResponse>>> {
    let email = validate_email(&req.email)?;

    // 查找用户
    let user: Option<UserRow> = sqlx::query_as(
        "SELECT id, email, password_hash, username, avatar_hash, is_admin, created_at
         FROM users WHERE email = $1"
    )
    .bind(&email)
    .fetch_optional(&pool)
    .await?;

    // 无论邮箱是否存在都返回同一条错误信息，避免枚举已注册邮箱
    let user = user.ok_or_else(|| AppError::Auth("邮箱或密码错误".to_string()))?;

    // 验证密码
    let is_valid = verify(&req.password, &user.password_hash)
        .map_err(|_| AppError::Auth("邮箱或密码错误".to_string()))?;

    if !is_valid {
        return Err(AppError::Auth("邮箱或密码错误".to_string()));
    }

    // 创建 JWT token
    let token = create_jwt(user.id)?;

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
    let email = validate_email(&req.email)?;

    let user: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&pool)
        .await?;

    // 邮箱未注册时也返回成功，避免泄露邮箱是否注册
    if let Some((user_id,)) = user {
        // 生成一次性验证码，仅存储其哈希值
        let code: String = format!("{:06}", rand::thread_rng().gen_range(0..1_000_000));
        let code_hash = hash(&code, DEFAULT_COST)?;
        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(RESET_CODE_TTL_MINUTES);

        // 作废该用户此前未使用的验证码
        sqlx::query(
            "UPDATE password_reset_codes SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL"
        )
        .bind(user_id)
        .execute(&pool)
        .await?;

        sqlx::query(
            "INSERT INTO password_reset_codes (id, user_id, code_hash, expires_at)
             VALUES ($1, $2, $3, $4)"
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(&code_hash)
        .bind(expires_at)
        .execute(&pool)
        .await?;

        // TODO: 通过邮件发送验证码。尚无邮件通道时，可显式开启日志输出用于本地开发。
        if std::env::var("PASSWORD_RESET_CODE_LOG").as_deref() == Ok("true") {
            tracing::warn!(
                "PASSWORD_RESET_CODE_LOG enabled: reset code for user {} is {}",
                user_id,
                code
            );
        } else {
            tracing::info!(
                "Password reset code generated for user {} (email delivery not configured)",
                user_id
            );
        }
    }

    Ok(Json(ApiResponse {
        data: SuccessResponse { success: true },
    }))
}

pub async fn reset_password(
    State(pool): State<PgPool>,
    Json(req): Json<ResetPasswordRequest>,
) -> AppResult<Json<ApiResponse<SuccessResponse>>> {
    let email = validate_email(&req.email)?;
    validate_password(&req.new_password)?;

    let invalid_code = || AppError::Validation("验证码无效或已过期".to_string());

    // 用户不存在时返回与验证码错误相同的信息，避免泄露邮箱是否注册
    let (user_id,): (Uuid,) = sqlx::query_as("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&pool)
        .await?
        .ok_or_else(invalid_code)?;

    // 取该用户最近一条未使用且未过期的验证码
    let reset_code: Option<(Uuid, String)> = sqlx::query_as(
        "SELECT id, code_hash FROM password_reset_codes
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1"
    )
    .bind(user_id)
    .fetch_optional(&pool)
    .await?;

    let (code_id, code_hash) = reset_code.ok_or_else(invalid_code)?;

    if !verify(&req.code, &code_hash).unwrap_or(false) {
        return Err(invalid_code());
    }

    let password_hash = hash(&req.new_password, DEFAULT_COST)?;

    let mut tx = pool.begin().await?;

    // 标记验证码已使用（一次性），并确保并发请求只能消费一次
    let consumed = sqlx::query(
        "UPDATE password_reset_codes SET used_at = NOW()
         WHERE id = $1 AND used_at IS NULL"
    )
    .bind(code_id)
    .execute(&mut *tx)
    .await?;

    if consumed.rows_affected() == 0 {
        return Err(invalid_code());
    }

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
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

    validate_password(&req.new_password)?;

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
