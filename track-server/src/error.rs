use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use bcrypt::BcryptError;
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Password hash error: {0}")]
    PasswordHash(#[from] BcryptError),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Database(e) => {
                tracing::error!("Database error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "数据库错误".to_string())
            }
            AppError::Auth(msg) => (StatusCode::UNAUTHORIZED, msg),
            AppError::Jwt(e) => {
                tracing::error!("JWT error: {:?}", e);
                (StatusCode::UNAUTHORIZED, "无效的令牌".to_string())
            }
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            AppError::PasswordHash(e) => {
                tracing::error!("Password hash error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "密码处理错误".to_string())
            }
            AppError::Config(msg) => {
                tracing::error!("Configuration error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "服务端配置错误".to_string())
            }
            AppError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误".to_string())
            }
        };

        let body = json!({
            "error": error_message
        });

        (status, Json(body)).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use serde_json::Value;

    async fn response_json(error: AppError) -> (StatusCode, Value) {
        let response = error.into_response();
        let status = response.status();
        let body = to_bytes(response.into_body(), usize::MAX).await.expect("response body");
        (status, serde_json::from_slice(&body).expect("JSON body"))
    }

    #[tokio::test]
    async fn maps_each_error_to_status_and_json_body() {
        let cases = vec![
            (AppError::Database(sqlx::Error::RowNotFound), StatusCode::INTERNAL_SERVER_ERROR, "数据库错误"),
            (AppError::Auth("unauthorized".into()), StatusCode::UNAUTHORIZED, "unauthorized"),
            (
                AppError::Jwt(jsonwebtoken::errors::Error::from(
                    jsonwebtoken::errors::ErrorKind::InvalidToken,
                )),
                StatusCode::UNAUTHORIZED,
                "无效的令牌",
            ),
            (AppError::Validation("invalid".into()), StatusCode::BAD_REQUEST, "invalid"),
            (AppError::NotFound("missing".into()), StatusCode::NOT_FOUND, "missing"),
            (AppError::Conflict("duplicate".into()), StatusCode::CONFLICT, "duplicate"),
            (
                AppError::PasswordHash(bcrypt::BcryptError::InvalidHash("invalid".into())),
                StatusCode::INTERNAL_SERVER_ERROR,
                "密码处理错误",
            ),
        ];

        for (error, status, message) in cases {
            let (actual_status, body) = response_json(error).await;
            assert_eq!(actual_status, status);
            assert_eq!(body, serde_json::json!({ "error": message }));
        }
    }

    #[test]
    fn from_conversions_preserve_error_variants() {
        let jwt_error = jsonwebtoken::errors::Error::from(jsonwebtoken::errors::ErrorKind::InvalidToken);
        assert!(matches!(AppError::from(jwt_error), AppError::Jwt(_)));
        let hash_error = bcrypt::BcryptError::InvalidHash("invalid".into());
        assert!(matches!(AppError::from(hash_error), AppError::PasswordHash(_)));
        let database_error = sqlx::Error::RowNotFound;
        assert!(matches!(AppError::from(database_error), AppError::Database(_)));
    }
}