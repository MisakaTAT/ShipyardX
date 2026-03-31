use serde::Deserialize;

#[derive(Deserialize)]
pub struct VersionResp {
    #[serde(rename = "ApiVersion")]
    pub api_version: String,
}

#[derive(Deserialize)]
pub struct DockerError {
    pub message: Option<String>,
}

#[derive(Deserialize)]
pub struct ContainerResp {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "Names")]
    pub names: Vec<String>,
    #[serde(rename = "Image")]
    pub image: String,
    #[serde(rename = "State")]
    pub state: String,
    #[serde(rename = "Status")]
    pub status: String,
    #[serde(rename = "Ports")]
    pub ports: Vec<PortResp>,
    #[serde(rename = "Created")]
    pub created: i64,
}

#[derive(Deserialize)]
pub struct PortResp {
    #[serde(rename = "IP")]
    pub ip: Option<String>,
    #[serde(rename = "PrivatePort")]
    pub private_port: u16,
    #[serde(rename = "PublicPort")]
    pub public_port: Option<u16>,
    #[serde(rename = "Type")]
    pub port_type: String,
}

#[derive(Deserialize)]
pub struct ImageResp {
    #[serde(rename = "Id")]
    pub id: String,
    #[serde(rename = "RepoTags")]
    pub repo_tags: Option<Vec<String>>,
    #[serde(rename = "Size")]
    pub size: i64,
    #[serde(rename = "Created")]
    pub created: i64,
}

