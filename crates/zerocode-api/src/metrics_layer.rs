use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Instant;

use axum::body::Body;
use axum::http::Request;
use axum::response::Response;
use tower::{Layer, Service};

#[derive(Clone)]
pub struct HttpMetricsLayer;

impl<S> Layer<S> for HttpMetricsLayer {
    type Service = HttpMetricsService<S>;
    fn layer(&self, inner: S) -> Self::Service {
        HttpMetricsService { inner }
    }
}

#[derive(Clone)]
pub struct HttpMetricsService<S> {
    inner: S,
}

impl<S> Service<Request<Body>> for HttpMetricsService<S>
where
    S: Service<Request<Body>, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let method = req.method().to_string();
        let path = normalize_path(req.uri().path());
        let start = Instant::now();

        let mut svc = self.inner.clone();
        Box::pin(async move {
            let response = svc.call(req).await?;
            let status = response.status().as_u16().to_string();
            let elapsed = start.elapsed().as_secs_f64();

            metrics::counter!(
                "zerocode_http_requests_total",
                "method" => method.clone(),
                "path" => path.clone(),
                "status" => status,
            )
            .increment(1);

            metrics::histogram!(
                "zerocode_http_request_duration_seconds",
                "method" => method,
                "path" => path,
            )
            .record(elapsed);

            Ok(response)
        })
    }
}

fn normalize_path(path: &str) -> String {
    if path.starts_with("/v1/submissions/") && path.len() > "/v1/submissions/".len() {
        let rest = &path["/v1/submissions/".len()..];
        if rest.contains('/') {
            return "/v1/submissions/{token}/stream".to_string();
        }
        return "/v1/submissions/{token}".to_string();
    }
    path.to_string()
}
