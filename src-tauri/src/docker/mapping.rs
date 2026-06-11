use crate::dto::container::Container;
use crate::dto::image::Image;
use crate::utils::formatting::{format_bytes_i64, format_time_ago_from_unix, format_unix_seconds};
use bollard::models::{ContainerSummary, ImageSummary, MountPoint, PortSummary};

fn format_port_ip(ip: &str) -> String {
    if ip.contains(':') && !ip.starts_with('[') {
        format!("[{ip}]")
    } else {
        ip.to_string()
    }
}

fn format_ports(ports: &[PortSummary]) -> String {
    ports
        .iter()
        .filter_map(|port| match (port.public_port, port.typ.clone()) {
            (Some(public_port), Some(port_type)) => {
                let ip = format_port_ip(port.ip.as_deref().unwrap_or("0.0.0.0"));
                Some(format!("{}:{}->{}/{}", ip, public_port, port.private_port, port_type))
            }
            (None, Some(port_type)) => Some(format!("{}/{}", port.private_port, port_type)),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn short_container_id(id: &str) -> String {
    id.get(..12.min(id.len())).unwrap_or(id).to_string()
}

pub fn api_container_to_dto(c: ContainerSummary) -> Container {
    let name = c
        .names
        .as_deref()
        .and_then(|names| names.first())
        .map(|n| n.trim_start_matches('/').to_string())
        .unwrap_or_default();
    let ip = c
        .network_settings
        .as_ref()
        .and_then(|settings| settings.networks.as_ref())
        .into_iter()
        .flat_map(|networks| networks.values())
        .filter_map(|n| n.ip_address.as_deref())
        .find(|ip| !ip.is_empty())
        .unwrap_or("-")
        .to_string();

    let mut volumes: Vec<String> = c
        .mounts
        .unwrap_or_default()
        .into_iter()
        .filter(|m: &MountPoint| m.typ.as_deref() == Some("volume"))
        .filter_map(|m| m.name)
        .filter(|s| !s.is_empty())
        .collect();
    volumes.sort();
    volumes.dedup();

    let stack = c
        .labels
        .as_ref()
        .and_then(|m| {
            m.get("com.docker.compose.project")
                .or_else(|| m.get("com.docker.stack.namespace"))
        })
        .cloned()
        .unwrap_or_default();

    Container {
        id: short_container_id(c.id.as_deref().unwrap_or_default()),
        name,
        image: c.image.unwrap_or_default(),
        state: c.state.map(|v| v.to_string()).unwrap_or_default(),
        status: c.status.unwrap_or_default(),
        stack,
        ip,
        ports: format_ports(c.ports.as_deref().unwrap_or(&[])),
        created_at: format_unix_seconds(c.created.unwrap_or_default()),
        created_ago: format_time_ago_from_unix(c.created.unwrap_or_default()),
        volumes,
    }
}

pub fn api_image_to_dto(img: ImageSummary, used_by_count: u32) -> Image {
    let (repository, tag) = img
        .repo_tags
        .iter()
        .find(|t| *t != "<none>:<none>")
        .map(|t| {
            t.rfind(':')
                .map(|i| (t[..i].to_string(), t[i + 1..].to_string()))
                .unwrap_or_else(|| (t.to_string(), "latest".to_string()))
        })
        .unwrap_or_else(|| ("<none>".to_string(), "<none>".to_string()));

    Image {
        id: img.id,
        repository,
        tag,
        size: format_bytes_i64(img.size),
        created_at: format_unix_seconds(img.created),
        created_ago: format_time_ago_from_unix(img.created),
        used_by_count,
    }
}
