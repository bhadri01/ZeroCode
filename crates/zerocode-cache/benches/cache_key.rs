use criterion::{Criterion, black_box, criterion_group, criterion_main};
use zerocode_cache::CacheKey;
use zerocode_core::ResourceLimits;

fn bench_result_key_small(c: &mut Criterion) {
    let source = b"print('hello')";
    let stdin = b"";
    let limits = ResourceLimits::default();

    c.bench_function("result_key/small_14B", |b| {
        b.iter(|| CacheKey::result(black_box(71), black_box(source), black_box(stdin), &limits))
    });
}

fn bench_result_key_medium(c: &mut Criterion) {
    let source = vec![b'x'; 4096];
    let stdin = vec![b'y'; 256];
    let limits = ResourceLimits::default();

    c.bench_function("result_key/medium_4KB", |b| {
        b.iter(|| {
            CacheKey::result(
                black_box(71),
                black_box(&source),
                black_box(&stdin),
                &limits,
            )
        })
    });
}

fn bench_result_key_large(c: &mut Criterion) {
    let source = vec![b'x'; 64 * 1024];
    let stdin = vec![b'y'; 64 * 1024];
    let limits = ResourceLimits::default();

    c.bench_function("result_key/large_128KB", |b| {
        b.iter(|| {
            CacheKey::result(
                black_box(71),
                black_box(&source),
                black_box(&stdin),
                &limits,
            )
        })
    });
}

fn bench_compile_key(c: &mut Criterion) {
    let source = vec![b'x'; 4096];

    c.bench_function("compile_key/4KB", |b| {
        b.iter(|| CacheKey::compile(black_box(73), black_box(&source), black_box(b"")))
    });
}

criterion_group!(
    benches,
    bench_result_key_small,
    bench_result_key_medium,
    bench_result_key_large,
    bench_compile_key,
);
criterion_main!(benches);
