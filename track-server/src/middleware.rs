use axum::{
    body::Body,
    extract::State,
    http::{header::AUTHORIZATION, StatusCode, request::Request},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use uuid::Uuid;

use crate::auth::AuthContext;
use crate::models::Claims;

pub async fn auth_middleware(
    State(jwt_secret): State<String>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            header[7..].trim()
        }
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    match decode_jwt(token, &jwt_secret) {
        Ok(claims) => {
            let user_id = Uuid::parse_str(&claims.sub)
                .map_err(|_| StatusCode::UNAUTHORIZED)?;

            request.extensions_mut().insert(AuthContext {
                user_id,
                is_admin: false,
            });
            Ok(next.run(request).await)
        }
        Err(_) => Err(StatusCode::UNAUTHORIZED),
    }
}

pub fn decode_jwt(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
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
    use crate::models::Claims;
    use jsonwebtoken::{encode, EncodingKey, Header};

    #[test]
    fn decodes_tokens_with_the_supplied_secret_only() {
        let user_id = Uuid::new_v4();
        let token = encode(
            &Header::default(),
            &Claims { sub: user_id.to_string(), exp: (chrono::Utc::now() + chrono::Duration::days(7)).timestamp() as usize },
            &EncodingKey::from_secret(b"middleware-secret"),
        ).expect("create JWT");
        let claims = decode_jwt(&token, "middleware-secret").expect("decode JWT");
        assert_eq!(claims.sub, user_id.to_string());
        assert!(decode_jwt(&token, "wrong-secret").is_err());
    }
}
