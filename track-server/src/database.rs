use sqlx::{PgPool, postgres::PgPoolOptions};
use std::env;

pub async fn create_pool() -> Result<PgPool, sqlx::Error> {
    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    tracing::info!("Connecting to database...");

    PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .map_err(|e| {
            // 提供更清晰的错误信息，帮助诊断连接问题
            tracing::error!("Database connection failed: {}", e);
            tracing::error!(
                "Please check DATABASE_URL in .env file. Current DATABASE_URL points to: {}",
                mask_password(&database_url)
            );
            tracing::error!(
                "If PostgreSQL returns non-UTF-8 error messages, this usually indicates \
                 an authentication failure (wrong user/password/database). \
                 Check that the user, password, and database name in DATABASE_URL are correct."
            );
            e
        })
}

/// 隐藏密码部分，仅用于日志输出
fn mask_password(url: &str) -> String {
    if let Some(scheme_end) = url.find("://") {
        let after_scheme = &url[scheme_end + 3..];
        if let Some(at_pos) = after_scheme.find('@') {
            let credentials = &after_scheme[..at_pos];
            if let Some(colon_pos) = credentials.find(':') {
                let user = &credentials[..colon_pos];
                let rest = &after_scheme[at_pos..];
                return format!("postgresql://{}:****{}", user, rest);
            }
        }
    }
    url.to_string()
}
