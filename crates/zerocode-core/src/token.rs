use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::error::CoreError;

/// Public submission identifier. ULID for sortability + DB index locality.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Token(Ulid);

impl Token {
    pub fn new() -> Self {
        Self(Ulid::new())
    }

    pub fn as_ulid(&self) -> Ulid {
        self.0
    }
}

impl Default for Token {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl FromStr for Token {
    type Err = CoreError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ulid::from_str(s)
            .map(Token)
            .map_err(|_| CoreError::InvalidToken(s.to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_roundtrip() {
        let t = Token::new();
        let s = t.to_string();
        let back = Token::from_str(&s).unwrap();
        assert_eq!(t, back);
    }

    #[test]
    fn token_rejects_garbage() {
        assert!(Token::from_str("not-a-ulid").is_err());
    }
}
