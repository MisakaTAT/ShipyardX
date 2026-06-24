use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppTemplateField {
    pub env_key: String,
    pub label: String,
    #[serde(default)]
    pub default_value: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default = "default_field_type")]
    pub field_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppTemplateFile {
    pub path: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub executable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppTemplate {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub compose: String,
    #[serde(default)]
    pub directories: Vec<String>,
    #[serde(default)]
    pub files: Vec<AppTemplateFile>,
    #[serde(default)]
    pub fields: Vec<AppTemplateField>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppTemplateInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub compose: String,
    #[serde(default)]
    pub directories: Vec<String>,
    #[serde(default)]
    pub files: Vec<AppTemplateFile>,
    #[serde(default)]
    pub fields: Vec<AppTemplateField>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct DeployTemplate {
    pub server_id: String,
    pub template_id: String,
    pub env_values: HashMap<String, String>,
}

fn default_field_type() -> String {
    "text".to_string()
}
