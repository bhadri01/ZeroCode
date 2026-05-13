// Compile zerocode.proto into Rust types using tonic-build.
//
// Output lands in OUT_DIR; `src/grpc.rs` imports it with
// `tonic::include_proto!("zerocode.v2")`. Re-runs the build when the proto
// file changes.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto = "proto/zerocode.proto";
    println!("cargo:rerun-if-changed={proto}");
    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .compile_protos(&[proto], &["proto"])?;
    Ok(())
}
