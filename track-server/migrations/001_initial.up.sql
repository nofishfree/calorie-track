-- Nutrition Tracker App - Initial Database Schema
-- Database: PostgreSQL 18

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. users table
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    username VARCHAR(100),
    avatar_hash VARCHAR(64),              -- Avatar hash (SHA-256), references avatars.hash
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ============================================
-- 2. avatars table
-- ============================================
CREATE TABLE IF NOT EXISTS avatars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hash VARCHAR(64) UNIQUE NOT NULL,     -- SHA-256 hash (64 hex chars)
    data TEXT NOT NULL,                   -- base64 encoded avatar data
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_avatars_hash ON avatars(hash);

-- ============================================
-- 3. foods table
-- ============================================
CREATE TABLE IF NOT EXISTS foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    num DOUBLE PRECISION NOT NULL,
    calorie DOUBLE PRECISION NOT NULL,
    calorie_unit VARCHAR(10) NOT NULL DEFAULT 'kj',
    carbs_g DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein_g DOUBLE PRECISION NOT NULL DEFAULT 0,
    fat_g DOUBLE PRECISION NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL DEFAULT 'g',
    usage_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_foods_user_id ON foods(user_id);
CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
CREATE INDEX IF NOT EXISTS idx_foods_user_name ON foods(user_id, name);

-- ============================================
-- 4. meal_plans table
-- ============================================
CREATE TABLE IF NOT EXISTS meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plans_user ON meal_plans(user_id);

-- ============================================
-- 5. plan_items table
-- ============================================
CREATE TABLE IF NOT EXISTS plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    food_data JSONB NOT NULL,
    quantity DOUBLE PRECISION NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON plan_items(plan_id, sort_order);

-- ============================================
-- 6. meal_records table
-- ============================================
CREATE TABLE IF NOT EXISTS meal_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
    food_data JSONB NOT NULL,
    serving_count DOUBLE PRECISION NOT NULL,
    record_time TIMESTAMPTZ NOT NULL,
    calories_total DOUBLE PRECISION NOT NULL,
    carbs_total DOUBLE PRECISION NOT NULL DEFAULT 0,
    protein_total DOUBLE PRECISION NOT NULL DEFAULT 0,
    fat_total DOUBLE PRECISION NOT NULL DEFAULT 0,
    plan_id UUID REFERENCES meal_plans(id) ON DELETE SET NULL,
    plan_name VARCHAR(200),
    plan_items JSONB,
    is_quick_add BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_records_user_time ON meal_records(user_id, record_time);
CREATE INDEX IF NOT EXISTS idx_records_food_id ON meal_records(food_id);
CREATE INDEX IF NOT EXISTS idx_records_plan_id ON meal_records(plan_id);

-- ============================================
-- 7. goal_templates table
-- ============================================
CREATE TABLE IF NOT EXISTS goal_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'daily',
    cycle_days INT NOT NULL DEFAULT 1,
    today_index INT NOT NULL DEFAULT 0,
    daily_goals JSONB NOT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    last_active_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goal_templates_user ON goal_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_templates_current ON goal_templates(user_id, is_current);

-- ============================================
-- 8. operation_logs table
-- ============================================
CREATE TABLE IF NOT EXISTS operation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    serial_number BIGINT NOT NULL,
    operation_type VARCHAR(20) NOT NULL,
    entity_type VARCHAR(20) NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_serial ON operation_logs(user_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_operation_logs_user_time ON operation_logs(user_id, created_at);