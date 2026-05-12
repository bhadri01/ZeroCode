//! Java 21 edge cases. JVM-specific quirks: thread count, OOM handling,
//! StackOverflowError, JAVA_TOOL_OPTIONS interaction.

use zerocode_core::{ResourceLimits, Status};

use super::harness::*;

fn java_limits() -> ResourceLimits {
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

#[tokio::test]
async fn java_hello_world() {
    let source = r#"
public class Main {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("hello"));
}

#[tokio::test]
async fn java_compile_error() {
    let source = r#"
public class Main {
    public static void main(String[] args) {
        undefinedMethod();
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    assert!(
        matches!(result.status, Status::CompileError),
        "expected CompileError, got {:?}",
        result.status,
    );
    let compile_out = String::from_utf8_lossy(result.compile_output.as_ref().unwrap());
    assert!(compile_out.contains("error"));
}

#[tokio::test]
async fn java_non_zero_exit() {
    let source = r#"
public class Main {
    public static void main(String[] args) {
        System.exit(42);
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(42)),
        "System.exit(42) should be NonZeroExit(42), got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn java_stack_overflow() {
    let source = r#"
public class Main {
    static int recurse(int n) { return recurse(n + 1) + n; }
    public static void main(String[] args) {
        System.out.println(recurse(0));
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    // Java StackOverflowError → JVM exits 1
    assert!(
        matches!(result.status, Status::NonZeroExit(1)),
        "StackOverflowError should exit 1, got {:?}",
        result.status,
    );
}

#[tokio::test]
async fn java_oom_with_exit_on_oom() {
    // JAVA_TOOL_OPTIONS includes -XX:+ExitOnOutOfMemoryError, so OOM → exit(1).
    // The cgroup may also OOM-kill the entire JVM → MemoryLimitExceeded.
    let source = r#"
import java.util.ArrayList;
public class Main {
    public static void main(String[] args) {
        ArrayList<byte[]> leak = new ArrayList<>();
        while (true) {
            leak.add(new byte[1024 * 1024]);
        }
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    assert!(
        matches!(
            result.status,
            Status::NonZeroExit(_) | Status::MemoryLimitExceeded | Status::RuntimeError(_)
        ),
        "OOM should fail, got {:?}",
        result.status,
    );
    assert!(!matches!(result.status, Status::Accepted));
}

#[tokio::test]
async fn java_unhandled_exception() {
    let source = r#"
public class Main {
    public static void main(String[] args) {
        throw new RuntimeException("boom");
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    assert!(
        matches!(result.status, Status::NonZeroExit(1)),
        "uncaught exception should exit 1, got {:?}",
        result.status,
    );
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(stderr.contains("RuntimeException") || stderr.contains("boom"));
}

#[tokio::test]
async fn java_stdin_read() {
    let source = r#"
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String line = sc.nextLine();
        System.out.println("got: " + line);
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "hello\n", java_limits())).await;
    assert!(matches!(result.status, Status::Accepted));
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("got: hello"));
}

#[tokio::test]
async fn java_threading_under_pids_max() {
    let source = r#"
public class Main {
    public static void main(String[] args) throws Exception {
        Thread[] threads = new Thread[4];
        for (int i = 0; i < 4; i++) {
            final int n = i;
            threads[i] = new Thread(() -> System.out.println("thread " + n));
            threads[i].start();
        }
        for (Thread t : threads) t.join();
        System.out.println("done");
    }
}
"#;
    let result = run(job_with_limits(JAVA, source, "", java_limits())).await;
    assert!(
        matches!(result.status, Status::Accepted),
        "basic threading should work under pids.max=96, got {:?}",
        result.status,
    );
    let stdout = String::from_utf8_lossy(&result.stdout);
    assert!(stdout.contains("done"));
}
