use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;

/// 1Panel App Store 应用根 data.yml 结构
/// 注意：实际 1Panel appstore 的 data.yml 中 description 是普通字符串，i18n 在 additionalProperties 里
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

/// 版本子目录下的版本 data.yml 结构
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

/// 已安装的应用信息
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct InstalledApp {
    pub install_id: String,
    pub app_key: String,
    pub app_name: String,
    pub version: String,
    pub server_id: String,
    pub install_path: String,
    pub status: String, // running, stopped, error, unknown
    pub created_at: String,
}

/// 传递给前端的应用列表项（含已安装状态）
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppListItem {
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub app_type: String,
    pub tags: Vec<String>,
    pub description: String,
    pub short_desc_zh: String,
    pub short_desc_en: String,
    pub website: String,
    pub icon: String, // base64
    pub installed: bool,
    pub versions: Vec<String>,
}

/// 传递给前端的应用详情
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppDetail {
    pub key: String,
    pub name: String,
    pub tags: Vec<String>,
    pub description: DescriptionI18n,
    pub short_desc_zh: String,
    pub short_desc_en: String,
    pub website: String,
    pub github: String,
    pub document: String,
    pub icon: String,
    pub installed: bool,
    pub versions: Vec<AppVersionInfo>,
    pub readme_zh: String,
    pub readme_en: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct AppVersionInfo {
    pub version: String,
    pub form_fields: Vec<FormField>,
    pub compose_preview: String, // docker-compose.yml 内容预览
}

/// 安装应用的请求参数
#[derive(Debug, Serialize, Deserialize, Clone, Type)]
pub struct InstallAppRequest {
    pub server_id: String,
    pub app_key: String,
    pub version: String,
    /// 用户填写的环境变量值，key=envKey, value=用户输入
    pub env_values: std::collections::HashMap<String, String>,
}

/// 自定义反序列化：将 YAML 中的数字/布尔值转为字符串
fn deser_opt_string_from_any<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Visitor;
    use std::fmt;

    struct AnyToString;

    impl<'de> Visitor<'de> for AnyToString {
        type Value = Option<String>;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            write!(f, "a string, number, or boolean")
        }

        fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<Self::Value, E> {
            Ok(if v.is_empty() { None } else { Some(v.to_string()) })
        }

        fn visit_string<E: serde::de::Error>(self, v: String) -> Result<Self::Value, E> {
            Ok(if v.is_empty() { None } else { Some(v) })
        }

        fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_bool<E: serde::de::Error>(self, v: bool) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_none<E: serde::de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
    }

    deserializer.deserialize_any(AnyToString)
}
