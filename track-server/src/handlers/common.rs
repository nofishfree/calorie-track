use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

/// 插入套餐项的 SQL（typed 与 JSON 两种来源共用）
pub const INSERT_PLAN_ITEM_SQL: &str =
    "INSERT INTO plan_items (id, plan_id, food_id, food_data, quantity, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)";

/// 查询套餐项的 SQL
pub const SELECT_PLAN_ITEMS_SQL: &str =
    "SELECT id, plan_id, food_id, food_data, quantity, sort_order
     FROM plan_items WHERE plan_id = $1 ORDER BY sort_order";

/// 允许同步的操作类型
pub const VALID_OPERATION_TYPES: [&str; 3] = ["add", "update", "delete"];

/// 允许同步的实体类型
pub const VALID_ENTITY_TYPES: [&str; 5] = ["food", "record", "plan", "goal", "account"];

/// 需要校验归属的实体
#[derive(Clone, Copy)]
pub enum OwnedEntity {
    Food,
    MealRecord,
    GoalTemplate,
}

impl OwnedEntity {
    fn table(self) -> &'static str {
        match self {
            OwnedEntity::Food => "foods",
            OwnedEntity::MealRecord => "meal_records",
            OwnedEntity::GoalTemplate => "goal_templates",
        }
    }

    /// 实体不存在时的提示
    fn missing_message(self) -> &'static str {
        match self {
            OwnedEntity::Food => "食物不存在",
            OwnedEntity::MealRecord => "饮食记录不存在",
            OwnedEntity::GoalTemplate => "目标模板不存在",
        }
    }

    /// 无权限提示中使用的实体名称
    fn label(self) -> &'static str {
        match self {
            OwnedEntity::Food => "食物",
            OwnedEntity::MealRecord => "记录",
            OwnedEntity::GoalTemplate => "目标模板",
        }
    }
}

/// 校验实体存在且属于当前用户，`action` 用于错误提示（如“更新”“删除”）
pub async fn ensure_owner(
    pool: &PgPool,
    entity: OwnedEntity,
    id: Uuid,
    user_id: Uuid,
    action: &str,
) -> AppResult<()> {
    let owner: Option<Option<Uuid>> = sqlx::query_scalar(&format!(
        "SELECT user_id FROM {} WHERE id = $1",
        entity.table()
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let owner = owner.ok_or_else(|| AppError::NotFound(entity.missing_message().to_string()))?;

    if owner != Some(user_id) {
        return Err(AppError::Auth(format!(
            "无权{}此{}",
            action,
            entity.label()
        )));
    }

    Ok(())
}
