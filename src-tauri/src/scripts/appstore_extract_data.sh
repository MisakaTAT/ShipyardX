mkdir -p "$HOME"/__REMOTE_REL_DIR__ &&
printf '%s' "__TAR_B64__" | base64 -d | tar -xzf - -C "$HOME"/__REMOTE_REL_PARENT__
