pub(crate) const APPSTORE_CREATE_NETWORK_SH: &str = include_str!("scripts/appstore_create_network.sh");
pub(crate) const APPSTORE_COMPOSE_UP_SH: &str = include_str!("scripts/appstore_compose_up.sh");
pub(crate) const DOCKER_READ_DAEMON_CONFIG_SH: &str = include_str!("scripts/docker_read_daemon_config.sh");
pub(crate) const DOCKER_CHECK_SOCKET_SH: &str = include_str!("scripts/docker_check_socket.sh");
pub(crate) const DOCKER_CHECK_TCP_SH: &str = include_str!("scripts/docker_check_tcp.sh");
pub(crate) const SYSTEM_RESTART_WITH_PASSWORD_SH: &str = include_str!("scripts/system_restart_with_password.sh");
pub(crate) const SYSTEM_RESTART_WITHOUT_PASSWORD_SH: &str = include_str!("scripts/system_restart_without_password.sh");

pub(crate) fn render(template: &str, replacements: &[(&str, &str)]) -> String {
    let mut rendered = template.to_string();
    for (from, to) in replacements {
        rendered = rendered.replace(from, to);
    }
    rendered
}

pub(crate) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

pub(crate) fn render_shell(template: &str, raw: &[(&str, &str)], quoted: &[(&str, &str)]) -> String {
    let quoted_replacements: Vec<(&str, String)> = quoted.iter().map(|(from, to)| (*from, shell_quote(to))).collect();
    let quoted_refs: Vec<(&str, &str)> = quoted_replacements
        .iter()
        .map(|(from, to)| (*from, to.as_str()))
        .collect();
    render(&render(template, raw), &quoted_refs)
}
