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

    #[test]
    fn parses_node_and_python_side_by_side() {
        let input = r#"
            [[language]]
            id = 63
            name = "Node.js"
            version = "22"
            source_file = "main.js"
            compile_cmd = []
            run_cmd = ["/usr/bin/node", "main.js"]
            env = [
                ["NODE_NO_WARNINGS", "1"],
                ["NODE_OPTIONS", "--max-old-space-size=${memory_mb}"],
            ]

            [[language]]
            id = 71
            name = "Python"
            version = "3.13"
            source_file = "main.py"
            compile_cmd = []
            run_cmd = ["/usr/bin/python3.13", "main.py"]
            env = []
        "#;
        let reg = LanguageRegistry::from_toml(input).unwrap();
        assert_eq!(reg.len(), 2);
        let node = reg.require(63).unwrap();
        assert_eq!(node.name, "Node.js");
        assert!(!node.is_compiled());
        assert!(
            node.env
                .iter()
                .any(|(k, _)| k == "NODE_OPTIONS"),
            "Node.js spec should carry NODE_OPTIONS env entry"
        );
        let py = reg.require(71).unwrap();
        assert_eq!(py.name, "Python");
        // List order is insertion order so registry.list() preserves it.
        let ids: Vec<u32> = reg.list().into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec![63, 71]);
    }
}
