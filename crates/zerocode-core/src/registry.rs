use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::language::{LanguageId, LanguageSpec};

/// Snapshot of the registered languages loaded at API/worker boot. Immutable
/// for the lifetime of the process; restart to pick up changes to
/// `runners/languages.toml`.
#[derive(Debug, Clone, Default)]
pub struct LanguageRegistry {
    by_id: HashMap<LanguageId, LanguageSpec>,
    order: Vec<LanguageId>,
}

impl LanguageRegistry {
    pub fn from_specs(specs: Vec<LanguageSpec>) -> Self {
        let mut by_id = HashMap::with_capacity(specs.len());
        let mut order = Vec::with_capacity(specs.len());
        for s in specs {
            order.push(s.id);
            by_id.insert(s.id, s);
        }
        Self { by_id, order }
    }

    pub fn from_toml(input: &str) -> Result<Self, CoreError> {
        let parsed: RegistryFile = toml::from_str(input)
            .map_err(|e| CoreError::InvalidToken(format!("toml parse: {e}")))?;
        Ok(Self::from_specs(parsed.language))
    }

    pub fn get(&self, id: LanguageId) -> Option<&LanguageSpec> {
        self.by_id.get(&id)
    }

    pub fn require(&self, id: LanguageId) -> Result<&LanguageSpec, CoreError> {
        self.by_id.get(&id).ok_or(CoreError::UnknownLanguage(id))
    }

    pub fn list(&self) -> Vec<&LanguageSpec> {
        self.order
            .iter()
            .filter_map(|id| self.by_id.get(id))
            .collect()
    }

    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }
}

#[derive(Debug, Deserialize, Serialize)]
struct RegistryFile {
    #[serde(default)]
    language: Vec<LanguageSpec>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_python_spec() {
        let input = r#"
            [[language]]
            id = 71
            name = "Python"
            version = "3.13"
            source_file = "main.py"
            compile_cmd = []
            run_cmd = ["/usr/bin/python3.13", "main.py"]
            env = [["PYTHONUNBUFFERED", "1"]]
        "#;
        let reg = LanguageRegistry::from_toml(input).unwrap();
        let p = reg.require(71).unwrap();
        assert_eq!(p.name, "Python");
        assert!(!p.is_compiled());
        assert_eq!(reg.len(), 1);
    }

    #[test]
    fn unknown_id_errors() {
        let reg = LanguageRegistry::default();
        assert!(reg.require(999).is_err());
    }
}
