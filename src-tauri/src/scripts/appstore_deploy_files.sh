mkdir -p "$HOME"/__REMOTE_REL_BASE__ &&
printf '%s' "__COMPOSE_B64__" | base64 -d > "$HOME"/__REMOTE_REL_BASE__/docker-compose.yml &&
printf '%s' "__ENV_B64__" | base64 -d > "$HOME"/__REMOTE_REL_BASE__/.env
