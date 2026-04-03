use crate::models::app::container::Container;
use crate::models::app::image::Image;
use crate::models::docker::container::{ContainerSummary, PortBinding};
use crate::models::docker::image::ImageSummary;

fn format_ports(ports: &[PortBinding]) -> String {
    ports
        .iter()
        .filter_map(|p| {
            p.public_port.map(|pub_port| {
                let ip = p.ip.as_deref().unwrap_or("0.0.0.0");
                format!("{}:{}->{}/{}", ip, pub_port, p.private_port, p.port_type)
            })
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn format_bytes(bytes: i64) -> String {
    const MB: f64 = 1_048_576.0;
    const GB: f64 = 1_073_741_824.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.2} GB", b / GB)
    } else if b >= MB {
        format!("{:.1} MB", b / MB)
    } else {
        format!("{:.1} KB", b / 1024.0)
    }
}

fn short_container_id(id: &str) -> String {
    id.get(..12.min(id.len())).unwrap_or(id).to_string()
}

pub fn api_container_to_dto(c: ContainerSummary) -> Container {
    let ContainerSummary {
        id,
        names,
        image,
        state,
        status,
        ports,
        created,
        network_settings,
    } = c;
    let name = names
        .first()
        .map(|n| n.trim_start_matches('/').to_string())
        .unwrap_or_default();
    let ip = network_settings
        .networks
        .values()
        .map(|n| n.ip_address.as_str())
        .find(|ip| !ip.is_empty())
        .unwrap_or("-")
        .to_string();

    Container {
        id: short_container_id(&id),
        name,
        image,
        state,
        status,
        ip,
        ports: format_ports(&ports),
        created_ts: created,
    }
}

pub fn api_image_to_dto(img: ImageSummary) -> Image {
    let ImageSummary {
        id,
        repo_tags,
        size,
        created,
    } = img;
    let (repository, tag) = repo_tags
        .as_deref()
        .and_then(|tags| tags.iter().find(|t| *t != "<none>:<none>"))
        .map(|t| {
            t.rfind(':')
                .map(|i| (t[..i].to_string(), t[i + 1..].to_string()))
                .unwrap_or_else(|| (t.to_string(), "latest".to_string()))
        })
        .unwrap_or_else(|| ("<none>".to_string(), "<none>".to_string()));

    Image {
        id,
        repository,
        tag,
        size: format_bytes(size),
        created_ts: created,
    }
}
