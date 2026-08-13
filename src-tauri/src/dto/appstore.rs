use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum YamlPrimitive {
    String(String),
    Int(i64),
    Float(f64),
    Bool(bool),
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppManifest {
    pub name: String,
    pub tags: Vec<String>,
    pub title: String,
    #[serde(default)]
    pub description: String,

    #[serde(rename = "additionalProperties")]
    pub additional: AppAdditional,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct DescriptionI18n {
    #[serde(default)]
    pub en: String,
    #[serde(rename = "es-es", default)]
    pub es_es: String,
    #[serde(default)]
    pub ja: String,
    #[serde(default)]
    pub ms: String,
    #[serde(rename = "pt-br", default)]
    pub pt_br: String,
    #[serde(default)]
    pub ru: String,
    #[serde(default)]
    pub ko: String,
    #[serde(rename = "zh-Hant", default)]
    pub zh_hant: String,
    #[serde(rename = "zh", default)]
    pub zh: String,
    #[serde(default)]
    pub tr: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppAdditional {
    pub key: String,
    pub name: String,
    pub tags: Vec<String>,

    #[serde(rename = "shortDescZh")]
    pub short_desc_zh: String,

    #[serde(rename = "shortDescEn")]
    pub short_desc_en: String,

    #[serde(rename = "type")]
    pub app_type: String,

    #[serde(rename = "crossVersionUpdate")]
    pub cross_version_update: bool,

    pub limit: i32,
    pub architectures: Option<Vec<String>>,
    pub description: DescriptionI18n,
    pub website: Option<String>,
    pub github: Option<String>,
    pub document: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct VersionManifest {
    #[serde(rename = "additionalProperties")]
    pub additional: VersionAdditional,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct VersionAdditional {
    #[serde(rename = "formFields", default)]
    pub form_fields: Vec<FormField>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct FormField {
    #[serde(rename = "envKey")]
    pub env_key: String,

    #[serde(default, deserialize_with = "deser_opt_string_from_any")]
    #[specta(type = String)]
    pub default: Option<String>,

    #[serde(rename = "label")]
    pub label: FormFieldLabel,

    #[serde(default)]
    pub required: bool,

    #[serde(default, rename = "type")]
    pub field_type: String,

    #[serde(default)]
    pub values: Vec<FormFieldValue>,

    #[serde(default)]
    pub random: bool,

    #[serde(default)]
    pub rule: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct FormFieldLabel {
    #[serde(default)]
    pub en: String,

    #[serde(rename = "es-es", default)]
    pub es_es: String,
    #[serde(default)]
    pub ja: String,
    #[serde(default)]
    pub ms: String,
    #[serde(rename = "pt-br", default)]
    pub pt_br: String,
    #[serde(default)]
    pub ru: String,
    #[serde(default)]
    pub ko: String,
    #[serde(rename = "zh-Hant", default)]
    pub zh_hant: String,
    #[serde(rename = "zh", default)]
    pub zh: String,
    #[serde(default)]
    pub tr: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct FormFieldValue {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppListItem {
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub app_type: String,
    pub tags: Vec<String>,
    pub tags_en: Vec<String>,
    pub description: DescriptionI18n,
    pub short_desc_zh: String,
    pub short_desc_en: String,
    pub website: String,
    pub icon: String, // base64
    pub versions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppDetail {
    pub key: String,
    pub name: String,
    pub tags: Vec<String>,
    pub tags_en: Vec<String>,
    pub description: DescriptionI18n,
    pub short_desc_zh: String,
    pub short_desc_en: String,
    pub website: String,
    pub github: String,
    pub document: String,
    pub icon: String,
    pub versions: Vec<AppVersionInfo>,
    pub readme_zh: String,
    pub readme_en: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppVersionInfo {
    pub version: String,
    pub form_fields: Vec<FormField>,
    pub compose_preview: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct InstallApp {
    pub server_id: String,
    pub app_key: String,
    pub version: String,
    pub env_values: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppstoreSource {
    pub id: String,
    pub name: String,
    pub repo_url: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppstoreSettings {
    pub sources: Vec<AppstoreSource>,
    pub proxy_enabled: bool,
    pub proxy_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppstoreCacheInfo {
    pub cache_dir: String,
    pub exists: bool,
    pub size: String,
}

fn deser_opt_string_from_any<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Ok(match Option::<YamlPrimitive>::deserialize(d)? {
        None => None,
        Some(YamlPrimitive::String(s)) if s.is_empty() => None,
        Some(YamlPrimitive::String(s)) => Some(s),
        Some(YamlPrimitive::Int(n)) => Some(n.to_string()),
        Some(YamlPrimitive::Float(f)) => Some(f.to_string()),
        Some(YamlPrimitive::Bool(b)) => Some(b.to_string()),
    })
}
