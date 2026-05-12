use criterion::{Criterion, black_box, criterion_group, criterion_main};
use zerocode_core::{Payload, ResourceLimits, Token};

fn bench_token_generation(c: &mut Criterion) {
    c.bench_function("token/new_ulid", |b| b.iter(|| black_box(Token::new())));
}

fn bench_token_parse(c: &mut Criterion) {
    let t = Token::new();
    let s = t.to_string();

    c.bench_function("token/parse_roundtrip", |b| {
        b.iter(|| black_box(s.parse::<Token>().unwrap()))
    });
}

fn bench_payload_from_bytes(c: &mut Criterion) {
    let data = vec![0u8; 64 * 1024];
    c.bench_function("payload/from_64KB", |b| {
        b.iter(|| black_box(Payload::new(data.clone())))
    });
}

fn bench_payload_base64_roundtrip(c: &mut Criterion) {
    let data = vec![0xffu8; 4096];
    let p = Payload::new(data);
    let encoded = p.to_base64();

    c.bench_function("payload/base64_decode_4KB", |b| {
        b.iter(|| black_box(Payload::from_base64(&encoded).unwrap()))
    });
}

fn bench_limits_validate(c: &mut Criterion) {
    let lim = ResourceLimits::default();
    let ceiling = ResourceLimits {
        cpu_time: 30.0,
        wall_time: 60.0,
        memory_mb: 1024,
        max_pids: 256,
        max_stdout: 256 * 1024,
        max_stderr: 256 * 1024,
        enable_network: true,
    };

    c.bench_function("limits/validate", |b| {
        b.iter(|| black_box(lim.validate(&ceiling).unwrap()))
    });
}

criterion_group!(
    benches,
    bench_token_generation,
    bench_token_parse,
    bench_payload_from_bytes,
    bench_payload_base64_roundtrip,
    bench_limits_validate,
);
criterion_main!(benches);
