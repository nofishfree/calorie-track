use crate::error::{AppError, AppResult};

pub const MAX_EMAIL_LEN: usize = 255;
pub const MIN_PASSWORD_LEN: usize = 8;
pub const MAX_PASSWORD_LEN: usize = 128;
pub const MAX_USERNAME_LEN: usize = 100;

/// 校验邮箱格式（长度 + 基本结构），并返回去除首尾空格后的邮箱
/// 注意：不做大小写归一化，避免影响已注册用户的登录
pub fn validate_email(email: &str) -> AppResult<String> {
    let email = email.trim();

    if email.is_empty() || email.len() > MAX_EMAIL_LEN {
        return Err(AppError::Validation("邮箱格式无效".to_string()));
    }

    let mut parts = email.split('@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");

    let valid = parts.next().is_none()
        && !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !email.chars().any(|c| c.is_whitespace());

    if !valid {
        return Err(AppError::Validation("邮箱格式无效".to_string()));
    }

    Ok(email.to_string())
}

/// 校验密码强度（长度区间，避免空密码与 bcrypt 72 字节静默截断带来的意外）
pub fn validate_password(password: &str) -> AppResult<()> {
    if password.len() < MIN_PASSWORD_LEN {
        return Err(AppError::Validation(format!(
            "密码长度至少 {} 位",
            MIN_PASSWORD_LEN
        )));
    }

    if password.len() > MAX_PASSWORD_LEN {
        return Err(AppError::Validation(format!(
            "密码长度不能超过 {} 位",
            MAX_PASSWORD_LEN
        )));
    }

    Ok(())
}

/// 校验可选文本字段长度
pub fn validate_optional_text(value: Option<&String>, max_len: usize, field: &str) -> AppResult<()> {
    if let Some(value) = value {
        if value.chars().count() > max_len {
            return Err(AppError::Validation(format!(
                "{}长度不能超过 {} 个字符",
                field, max_len
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_email_and_trims() {
        assert_eq!(validate_email(" User@Example.com ").unwrap(), "User@Example.com");
    }

    #[test]
    fn rejects_malformed_email() {
        for bad in ["", "no-at-sign", "a@b", "a@@b.com", "a b@c.com", "a@.com"] {
            assert!(validate_email(bad).is_err(), "expected {bad} to be rejected");
        }
    }

    #[test]
    fn enforces_password_bounds() {
        assert!(validate_password("short1!").is_err());
        assert!(validate_password("longenough1!").is_ok());
        assert!(validate_password(&"a".repeat(MAX_PASSWORD_LEN + 1)).is_err());
    }
}
