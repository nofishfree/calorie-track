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
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "default-secret-key".to_string());
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
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "default-secret-key".to_string());
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}