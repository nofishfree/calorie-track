use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts, StatusCode},
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::env;
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

pub fn decode_jwt(token: &str) -> AppResult<Claims> {
    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "default-secret-key".to_string());
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{header::AUTHORIZATION, Request},
    };
    use std::future::Future;
    use tokio::sync::Mutex;

    static JWT_ENV_LOCK: Mutex<()> = Mutex::const_new(());

    async fn with_secret<T, F, Fut>(secret: &str, f: F) -> T
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = T>,
    {
        let _guard = JWT_ENV_LOCK.lock().await;
        let previous = env::var("JWT_SECRET").ok();
        env::set_var("JWT_SECRET", secret);
        let result = f().await;
        if let Some(previous) = previous {
            env::set_var("JWT_SECRET", previous);
        } else {
            env::remove_var("JWT_SECRET");
        }
        result
    }

    #[tokio::test]
    async fn jwt_roundtrip_and_claim_expiry() {
        with_secret("test-secret", || async {
            let user_id = Uuid::new_v4();
            let before = chrono::Utc::now().timestamp() as usize;
            let token = create_jwt(user_id).expect("create JWT");
            let claims = decode_jwt(&token).expect("decode JWT");

            assert_eq!(claims.sub, user_id.to_string());
            let expected = before + chrono::Duration::days(7).num_seconds() as usize;
            assert!((claims.exp as i64 - expected as i64).abs() <= 2);
        }).await;
    }

    #[tokio::test]
    async fn jwt_rejects_tampered_garbage_and_other_secrets() {
        with_secret("test-secret", || async {
            let token = create_jwt(Uuid::new_v4()).expect("create JWT");
            assert!(decode_jwt("not-a-token").is_err());
            let mut tampered = token.clone();
            tampered.push('x');
            assert!(decode_jwt(&tampered).is_err());
            env::set_var("JWT_SECRET", "different-secret");
            assert!(decode_jwt(&token).is_err());
        }).await;
    }

    #[tokio::test]
    async fn auth_context_extractor_validates_bearer_and_uuid_subject() {
        with_secret("test-secret", || async {
            let user_id = Uuid::new_v4();
            let token = create_jwt(user_id).expect("create JWT");

            for request in [
                Request::new(Body::empty()),
                Request::builder().header(AUTHORIZATION, "Basic abc").body(Body::empty()).unwrap(),
                Request::builder().header(AUTHORIZATION, "Bearer malformed").body(Body::empty()).unwrap(),
            ] {
                let (mut parts, _) = request.into_parts();
                assert!(matches!(
                    <AuthContext as FromRequestParts<()>>::from_request_parts(&mut parts, &()).await,
                    Err(StatusCode::UNAUTHORIZED)
                ));
            }

            let request = Request::builder()
                .header(AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap();
            let (mut parts, _) = request.into_parts();
            let context = <AuthContext as FromRequestParts<()>>::from_request_parts(&mut parts, &())
                .await
                .expect("valid auth context");
            assert_eq!(context.user_id, user_id);
            assert!(!context.is_admin);
        }).await;
    }
}