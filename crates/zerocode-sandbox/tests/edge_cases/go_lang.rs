//! Go edge cases.

use zerocode_core::Status;
use zerocode_core::status::TimeLimitKind;

use super::harness::*;

#[tokio::test]
async fn go_hello_world() {
    let source = r#"
package main
import "fmt"
func main() { fmt.Println("hello") }
"#;
    let result = run(job(GO, source)).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn go_compile_error() {
    let source = r#"
package main
func main() { undefined() }
"#;
    let result = run(job(GO, source)).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "expected CompileError, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn go_panic_nze() {
    let source = r#"
package main
func main() { panic("boom") }
"#;
    let result = run(job(GO, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(2)),
        "panic should exit 2, got {:?}",
        result.status,
    );
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("boom"));
}

#[tokio::test]
async fn go_goroutine_leak_wall_tle() {
    let source = r#"
package main
import "time"
func main() {
    for i := 0; i < 100; i++ {
        go func() { select {} }()
    }
    time.Sleep(999 * time.Second)
}
"#;
    let result = run(job_tight(GO, source)).await;
    assert!(
        matches!(
            result.status,
            Status::TimeLimitExceeded(TimeLimitKind::Wall)
        ),
        "goroutine leak + sleep should wall-TLE, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn go_stdin_read() {
    let source = r#"
package main
import (
    "bufio"
    "fmt"
    "os"
)
func main() {
    scanner := bufio.NewScanner(os.Stdin)
    scanner.Scan()
    fmt.Printf("got: %s\n", scanner.Text())
}
"#;
    let result = run(job_with_stdin(GO, source, "foobar\n")).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: foobar"));
}

#[tokio::test]
async fn go_non_zero_exit() {
    let source = r#"
package main
import "os"
func main() { os.Exit(5) }
"#;
    let result = run(job(GO, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(5)),
        "os.Exit(5) should be NonZeroExit(5), got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn go_index_out_of_range_panic() {
    let source = r#"
package main
func main() {
    s := []int{1, 2, 3}
    _ = s[10]
}
"#;
    let result = run(job(GO, source)).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(2)),
        "index OOB panic should exit 2, got {:?}",
        result.status,
    );
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("index out of range"));
}
