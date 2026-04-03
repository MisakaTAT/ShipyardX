use serde::Deserialize;

#[derive(Deserialize)]
pub struct DockerVersion {
    #[serde(rename = "ApiVersion")]
    pub api_version: String,
}

#[derive(Deserialize)]
pub struct DockerError {
    pub message: Option<String>,
}
