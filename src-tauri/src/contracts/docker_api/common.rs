use serde::Deserialize;
use serde::Deserializer;

#[derive(Deserialize)]
pub struct DockerVersion {
    #[serde(rename = "ApiVersion")]
    pub api_version: String,
    #[serde(rename = "Version", default)]
    pub version: String,
}

#[derive(Deserialize)]
pub struct DockerError {
    pub message: Option<String>,
}

pub fn null_vec_default<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Option::<Vec<T>>::deserialize(deserializer)?.unwrap_or_default())
}
