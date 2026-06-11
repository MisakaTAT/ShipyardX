mod bridge;
mod metrics;
mod rules;
mod runtime;

pub use metrics::list_local_addresses;
pub use rules::{
    create_port_forward_rule, delete_port_forward, list_all_port_forwards, list_port_forwards, set_port_forward_enabled,
};
pub use runtime::{start_all_enabled, start_all_enabled_global, stop_all_global, stop_port_forward};

const PORT_FORWARD_BIND_IP: &str = "127.0.0.1";
