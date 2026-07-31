# Submission status reference

Every submission carries a `status` object. It is **adjacently tagged**: a
`kind` discriminator plus an optional `detail` payload whose shape depends on
the kind.

```jsonc
{ "kind": "accepted" }
{ "kind": "time_limit_exceeded", "detail": "wall" }
{ "kind": "runtime_error",       "detail": { "name": "sigsegv" } }
{ "kind": "non_zero_exit",       "detail": 1 }
```

Clients must switch on `kind` and **fail closed on anything unrecognised** —
treat an unknown `kind` as a non-verdict (see [Handling unknown
kinds](#handling-unknown-kinds)), never as success. This list is the complete
vocabulary as of the current release; new kinds are additive and announced
before they ship.

Source of truth: `Status` in `crates/zerocode-core/src/status.rs`. A test
(`all_covers_every_variant`) fails the build if a variant is added without being
listed here.

---

## The complete vocabulary

| `kind` | Terminal | Verdict on the code | Retryable | Meaning |
|---|---|---|---|---|
| `queued` | no | – | – | Row accepted, not yet claimed by a worker. |
| `processing` | no | – | – | A worker holds the claim; execution in progress. |
| `accepted` | yes | yes | no | The program ran to completion and exited 0 within every limit. |
| `compile_error` | yes | yes | no | The compile phase exited non-zero. Diagnostics are in `compile_output`; `stdout`/`stderr` are empty because the program never ran. |
| `runtime_error` | yes | yes | no | Killed by a signal. `detail` is `{"name": "sigsegv"}` etc. |
| `non_zero_exit` | yes | yes | no | Ran to completion but exited non-zero. `detail` is the exit code. |
| `time_limit_exceeded` | yes | yes | no | `detail` is `"wall"` (wall-clock budget exhausted, process SIGKILLed) or `"cpu"` (CPU budget exhausted). |
| `memory_limit_exceeded` | yes | yes | no | The cgroup reported an OOM kill. |
| `output_limit_exceeded` | yes | yes | no | The program exceeded the stdout/stderr cap; output is truncated at the limit. |
| `sandbox_failure` | yes | **no** | **yes** | We could not execute the submission — the sandbox failed to build or its result was lost. Says nothing about the code. |
| `internal_error` | yes | **no** | **yes** | Any other fault on our side. Says nothing about the code. |
| `cancelled` | yes | no | no | Cancelled through the API before completion. |
| `expired` | yes | no | no | Past the retention TTL; the row stub remains for audit but outputs are gone. |

**Terminal** — the submission will not change again; stop polling.
**Verdict on the code** — the status describes what the submitted program did.
Only these are reproducible for identical `(language_id, source_code, stdin,
limits)`, and only these are safe to cache.
**Retryable** — resubmitting identical work may produce a different, better
answer.

### There is no `wrong_answer`

ZeroCode executes; it does not grade. A program that runs to completion is
`accepted` regardless of what it printed. Comparing `stdout` against expected
output is the caller's job. If you are mapping onto a Judge0-shaped enum,
`accepted` is Judge0's status 3 and your own comparison decides between
"Accepted" and "Wrong Answer".

---

## Handling unknown kinds

Fail closed. An unrecognised `kind` must be treated as **not a verdict** and not
as success:

```python
VERDICTS = {
    "accepted", "compile_error", "runtime_error", "non_zero_exit",
    "time_limit_exceeded", "memory_limit_exceeded", "output_limit_exceeded",
}
RETRYABLE = {"sandbox_failure", "internal_error"}

kind = result["status"]["kind"]
if kind in RETRYABLE or kind not in VERDICTS:
    raise EngineUnavailable(kind)   # retry or surface as infrastructure, never grade it
```

The failure mode this prevents is specific and severe: `sandbox_failure` carries
an **empty `stdout`**, so a grader that only compares stdout to expected output
scores it as a wrong answer. A transient fault on our side then reads as a
verdict against the student.

### Retry guidance

`sandbox_failure` and `internal_error` are the only kinds worth retrying.
Retry the identical payload up to twice with a short backoff (~250 ms, then
~1 s). The worker already retries retryable sandbox faults internally before it
will write either status, so one reaching you means the fault survived a
retry — treat a second occurrence as an incident, not a blip, and alert.

---

## Server-side timeouts, and which is which

Three different clocks can end a request. Only the first produces a status.

1. **The submission's own budgets** — `cpu_time_limit` and `wall_time_limit`,
   defaulted per language and overridable per request. Exceeding either produces
   `time_limit_exceeded` with `detail` `"cpu"` or `"wall"`. This is the only
   timeout that yields a verdict. The wall budget covers the whole submission,
   compile phase included; the CPU budget applies to the run phase only, so a
   slow compile cannot exhaust it. Every submission response echoes the limits
   that were actually applied in its `limits` object — read them from there
   rather than assuming the defaults.

2. **`POST /v1/submissions?wait=true` long-poll cap — 30 s.** This bounds how
   long the *HTTP request* blocks, not the submission. On expiry the API returns
   `200` with the row in whatever state it is in, which may still be `queued` or
   `processing`. That is not a failure and not a verdict: keep the `token` and
   poll `GET /v1/submissions/{token}`, or use `callback_url`. A non-terminal
   status in a `wait=true` response means "still running", nothing more.

3. **The stuck-claim sweeper** — if a worker dies mid-job, its claim is returned
   to `queued` after `2 × wall_time_limit + 60 s` and the submission is executed
   again. Invisible to clients apart from the extra latency.

---

## Timing fields

| Field | Meaning |
|---|---|
| `time` | CPU seconds consumed by the **run phase only**. For compiled languages the compiler's CPU is excluded. |
| `compile_time` | Wall-clock seconds spent in the compile phase. Absent for interpreted languages and for compile-cache hits (which skip compilation entirely). |
| `wall_time` | Wall-clock seconds for the whole submission, compile phase included. |
| `memory` | Peak resident memory of the **run phase**, in KB. The compiler's footprint is excluded. |

`time` and `compile_time` were a single combined figure in earlier releases,
which made a compiled submission's "execution time" include our toolchain's
work. They are now billed separately at the compile→run barrier, so `time`
measures the submitted program and is directly comparable with other engines.
This also means a slow compile no longer counts against the submission's
`cpu_time_limit`.
