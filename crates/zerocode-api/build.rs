// Compile zerocode.proto into Rust types using tonic-build.
//
// Two outputs in OUT_DIR:
//   - generated Rust types (`zerocode.v2.rs`), included via `tonic::include_proto!`
//   - a serialized FileDescriptorSet (`zerocode_descriptor.bin`), loaded by
//     `tonic-reflection` so clients can discover the service without the
//     .proto file (grpcurl `-d @` works against a running server directly).
//
// Re-runs the build when the proto file changes.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto = "proto/zerocode.proto";
    println!("cargo:rerun-if-changed={proto}");

    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR")?);
    let descriptor_path = out_dir.join("zerocode_descriptor.bin");

    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .file_descriptor_set_path(&descriptor_path)
        .compile_protos(&[proto], &["proto"])?;
    Ok(())
}
