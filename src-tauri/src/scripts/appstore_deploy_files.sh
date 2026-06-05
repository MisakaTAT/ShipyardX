mkdir -p "__REMOTE_BASE__" &&
printf '%s' "__COMPOSE_B64__" | base64 -d > "__REMOTE_BASE__/docker-compose.yml" &&
printf '%s' "__ENV_B64__" | base64 -d > "__REMOTE_BASE__/.env"
