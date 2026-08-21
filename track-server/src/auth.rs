use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;
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
        parts
            .extensions
            .get::<AuthContext>()
            .cloned()
            .ok_or(StatusCode::UNAUTHORIZED)
    }
}

pub fn create_jwt(user_id: Uuid, secret: &str) -> AppResult<String> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .expect("valid timestamp")
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