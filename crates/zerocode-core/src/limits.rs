use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// Per-submission resource ceiling. All fields validated against the system maximums
/// configured at the API edge before being passed to the worker.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ResourceLimits {
    /// CPU time budget in seconds. Enforced via cgroup `cpu.max` + `cpu.stat` polling.
    pub cpu_time: f64,
    /// Wall-clock budget in seconds. Enforced by the parent process timer.
    pub wall_time: f64,
    /// Memory budget in megabytes. Enforced via cgroup `memory.max`.
    pub memory_mb: u32,
    /// Max processes/threads. Enforced via cgroup `pids.max`.
    pub max_pids: u32,
    /// Max stdout bytes captured. Beyond this, the buffer wraps with a truncation marker.
    pub max_stdout: u32,
    /// Max stderr bytes captured. Same semantics as `max_stdout`.
    pub max_stderr: u32,
    /// Whether the sandbox has an active loopback / DNS-resolvable network. Default off.
    pub enable_network: bool,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            cpu_time: 2.0,
            wall_time: 5.0,
            memory_mb: 128,
            max_pids: 64,
            max_stdout: 64 * 1024,
            max_stderr: 64 * 1024,
            enable_network: false,
        }
    }
}

impl ResourceLimits {
    /// Validates that this ResourceLimits falls within the configured system ceiling.
    /// `ceiling` is typically loaded from config at API boot.
    pub fn validate(&self, ceiling: &ResourceLimits) -> Result<(), CoreError> {
        check_range("cpu_time", self.cpu_time, 0.1, ceiling.cpu_time)?;
        check_range("wall_time", self.wall_time, 0.1, ceiling.wall_time)?;
        check_range(
            "memory_mb",
            self.memory_mb as f64,
            1.0,
            ceiling.memory_mb as f64,
        )?;
        check_range(
            "max_pids",
            self.max_pids as f64,
            1.0,
            ceiling.max_pids as f64,
        )?;
        if self.wall_time < self.cpu_time {
            return Err(CoreError::LimitOutOfRange {
                field: "wall_time",
                value: self.wall_time,
                min: self.cpu_time,
                max: ceiling.wall_time,
            });
        }
        Ok(())
    }
}

fn check_range(field: &'static str, value: f64, min: f64, max: f64) -> Result<(), CoreError> {
    if value < min || value > max {
        return Err(CoreError::LimitOutOfRange {
            field,
            value,
            min,
            max,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_passes_validation() {
        let lim = ResourceLimits::default();
        let ceiling = ResourceLimits {
            cpu_time: 30.0,
            wall_time: 60.0,
            memory_mb: 1024,
            max_pids: 256,
            max_stdout: 1024 * 1024,
            max_stderr: 1024 * 1024,
            enable_network: true,
        };
        assert!(lim.validate(&ceiling).is_ok());
    }

    #[test]
    fn over_ceiling_rejected() {
        let mut lim = ResourceLimits::default();
        lim.memory_mb = 4096;
        let ceiling = ResourceLimits::default();
        assert!(lim.validate(&ceiling).is_err());
    }

    #[test]
    fn wall_below_cpu_rejected() {
        let lim = ResourceLimits {
            cpu_time: 5.0,
            wall_time: 2.0,
            ..ResourceLimits::default()
        };
        let ceiling = ResourceLimits {
            cpu_time: 30.0,
            wall_time: 60.0,
            ..ResourceLimits::default()
        };
        assert!(lim.validate(&ceiling).is_err());
    }
}
