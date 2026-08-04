use axum::{
    routing::{get, post, put},
    Router,
};
use std::collections::HashMap;
use std::env;
use std::sync::{Arc, Mutex};
use tower_http::cors::{CorsLayer, Any};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

mod auth;
mod database;
mod error;
mod middleware;
mod models;
mod handlers;

use handlers::{
    auth::{register, login, forgot_password, reset_password, change_password},
    avatars::{get_avatar, upload_avatar, check_avatar},
    foods::{create_food, get_foods, get_food, update_food, delete_food},
    meal_records::{create_meal_record, get_meal_records, update_meal_record, delete_meal_record},
    goals::{
        get_goal_templates, create_goal_template, get_goal_template,
        update_goal_template, delete_goal_template, set_current_goal_template,
    },
    user::{get_user_me, update_profile, delete_user_me},
    plans::{get_plans, get_plan, create_plan, update_plan, delete_plan},
    sync::{get_sync_changes, upload_sync_operation, versioned_sync, AppState},
};
use crate::models::SyncOperationRequest;
use middleware::auth_middleware;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "track_server=debug,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let pool = database::create_pool().await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to connect to database: {}. \
                Please verify DATABASE_URL in .env (user, password, database name). \
                Non-UTF-8 error messages typically indicate authentication failure.",
                e
            )
        })?;

    tracing::info!("Database connection established");

    // 运行数据库迁移（幂等，已存在的表会被跳过）
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| {
            tracing::error!("Database migration failed: {:?}", e);
            anyhow::anyhow!("Database migration failed: {}", e)
        })?;

    tracing::info!("Database migrations completed");

    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "default-secret-key".to_string());

    let operation_queues: Arc<Mutex<HashMap<Uuid, Vec<SyncOperationRequest>>>> =
        Arc::new(Mutex::new(HashMap::new()));

    let app_state = AppState {
        pool: pool.clone(),
        operation_queues,
    };

    let public_routes = Router::new()
        .route("/health", get(health_check))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/forgot-password", post(forgot_password))
        .route("/api/auth/reset-password", post(reset_password));

    let protected_routes = Router::new()
        .route("/api/auth/change-password", post(change_password))
        .route("/api/user/me", get(get_user_me).put(update_profile).delete(delete_user_me))
        .route("/api/avatars/:hash", get(get_avatar))
        .route("/api/avatars/check/:hash", get(check_avatar))
        .route("/api/avatars", post(upload_avatar))
        .route("/api/foods", post(create_food).get(get_foods))
        .route("/api/foods/:id", get(get_food).put(update_food).delete(delete_food))
        .route("/api/records", post(create_meal_record).get(get_meal_records))
        .route("/api/records/:id", put(update_meal_record).delete(delete_meal_record))
        .route("/api/plans", get(get_plans).post(create_plan))
        .route("/api/plans/:id", get(get_plan).put(update_plan).delete(delete_plan))
        .route("/api/goal-templates", get(get_goal_templates).post(create_goal_template))
        .route("/api/goal-templates/:id", get(get_goal_template).put(update_goal_template).delete(delete_goal_template))
        .route("/api/goal-templates/:id/current", put(set_current_goal_template))
        .route("/api/sync/changes", get(get_sync_changes))
        .route("/api/sync/operation", post(upload_sync_operation))
        .route("/api/sync/versioned", post(versioned_sync))
        .layer(axum::middleware::from_fn_with_state(
            jwt_secret.clone(),
            auth_middleware,
        ));

    let app = Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(app_state);

    let host = env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("{}:{}", host, port);

    tracing::info!("Starting server on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}
