use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts, StatusCode},
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::env;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::Claims;

/// JWT 密钥最小长度
pub const MIN_JWT_SECRET_LEN: usize = 32;

/// 从环境变量读取 JWT 密钥；未配置或过短时报错（不使用默认值）
pub fn jwt_secret() -> AppResult<String> {
    let secret = env::var("JWT_SECRET")
        .map_err(|_| AppError::Config("JWT_SECRET 未配置".to_string()))?;

    if secret.len() < MIN_JWT_SECRET_LEN {
        return Err(AppError::Config(format!(
            "JWT_SECRET 长度至少需要 {} 个字符",
            MIN_JWT_SECRET_LEN
        )));
    }

    Ok(secret)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthContext {
    pub user_id: Uuid,
    pub is_admin: bool,
}

#[axum::async_trait]
impl<S> FromRequestParts<S> for AuthContext
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|header| header.to_str().ok());

        let token = match auth_header {
            Some(header) if header.starts_with("Bearer ") => {
                header[7..].trim()
            }
            _ => return Err(StatusCode::UNAUTHORIZED),
        };

        match decode_jwt(token) {
            Ok(claims) => {
                let user_id = Uuid::parse_str(&claims.sub)
                    .map_err(|_| StatusCode::UNAUTHORIZED)?;
                Ok(AuthContext { user_id, is_admin: false })
            }
            Err(_) => Err(StatusCode::UNAUTHORIZED),
        }
    }
}

pub fn create_jwt(user_id: Uuid) -> AppResult<String> {
    let secret = jwt_secret()?;
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .ok_or_else(|| AppError::Internal("计算令牌过期时间失败".to_string()))?
        .timestamp();

    let claims = Claims {
        sub: user_id.to_string(),
        exp: expiration as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_ref()),
    )?;

    Ok(token)
}

pub fn decode_jwt(token: &str) -> AppResult<Claims> {
    let secret = jwt_secret()?;
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}