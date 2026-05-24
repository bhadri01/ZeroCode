//! .NET / native / SQL edge cases:
//!   C# (140), Swift (152), SQL (154), Dart (163)
//!
//! Each language tests hello world.

use zerocode_core::{ResourceLimits, Status};

use super::harness::*;

/// .NET languages need generous limits for runtime startup.
fn dotnet_limits() -> ResourceLimits {
    ResourceLimits {
        cpu_time: 10.0,
        wall_time: 20.0,
        memory_mb: 512,
        max_pids: 96,
        max_stdout: 64 * 1024,
        max_stderr: 64 * 1024,
        enable_network: false,
    }
}

// ═══════════════════════════════════════════════════════════════════════
// C# (140)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn csharp_hello() {
    let source = r#"using System;
class Program {
    static void Main() {
        Console.WriteLine("hello");
    }
}
"#;
    let result = run(job_with_limits(CSHARP, source, "", dotnet_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Swift (152)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn swift_hello() {
    let source = r#"print("hello")"#;
    let result = run(job(SWIFT, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// SQL (154) — SQLite
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn sql_hello() {
    let source = r#"SELECT 'hello' AS greeting;"#;
    let result = run(job(SQL, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Dart (163)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn dart_hello() {
    let source = r#"void main() {
  print('hello');
}
"#;
    let result = run(job(DART, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}
