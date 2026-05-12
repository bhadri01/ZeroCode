//! One-shot DB migrations binary. Lives in its own init container so multiple
//! API/worker replicas can't race on `sqlx::migrate!` at boot.

use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::Parser;
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "zerocode-migrate", about = "Run ZeroCode DB migrations")]
struct Args {
    #[arg(long, env = "DATABASE_URL")]
    database_url: String,

    /// Where the migration SQL files live. Defaults to the migrations/ folder
    /// at the repository root.
    #[arg(long, default_value = "migrations")]
    migrations_dir: PathBuf,

    /// Don't actually run; print pending migrations and exit 0.
    #[arg(long)]
    dry_run: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .json()
        .init();

    let args = Args::parse();

    tracing::info!(?args.migrations_dir, dry_run = args.dry_run, "starting migrations");

    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&args.database_url)
        .await
        .context("connecting to database")?;

    let migrator = sqlx::migrate::Migrator::new(args.migrations_dir.clone())
        .await
        .with_context(|| format!("loading migrations from {:?}", args.migrations_dir))?;

    if args.dry_run {
        tracing::info!(
            count = migrator.migrations.len(),
            "would apply (dry-run)"
        );
        for m in migrator.iter() {
            tracing::info!(version = m.version, name = %m.description, "pending");
        }
        return Ok(());
    }

    migrator.run(&pool).await.context("applying migrations")?;
    tracing::info!("migrations complete");
    Ok(())
}
