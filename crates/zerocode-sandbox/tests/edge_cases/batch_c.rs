//! JVM language edge cases: Kotlin, Scala.
//! Each tests hello world. Uses generous limits for JVM startup overhead.

use zerocode_core::{ResourceLimits, Status};

use super::harness::*;

fn jvm_limits() -> ResourceLimits {
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
// Kotlin (120)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn kotlin_hello() {
    let source = r#"fun main() {
    println("hello")
}
"#;
    let result = run(job_with_limits(KOTLIN, source, "", jvm_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

// ═══════════════════════════════════════════════════════════════════════
// Scala (121)
// ═══════════════════════════════════════════════════════════════════════

#[tokio::test]
async fn scala_hello() {
    let source = r#"object Main extends App {
  println("hello")
}
"#;
    let result = run(job_with_limits(SCALA, source, "", jvm_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}
