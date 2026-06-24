TMP_PATH=__TMP_PATH__

trap 'rm -f "$TMP_PATH"' EXIT

if [ "$(id -u)" = "0" ]; then
  install -m 0644 "$TMP_PATH" /etc/docker/daemon.json
elif command -v sudo >/dev/null 2>&1; then
  if sudo -n true >/dev/null 2>&1; then
    sudo -n install -m 0644 "$TMP_PATH" /etc/docker/daemon.json
  else
    echo "__ERR_SUDO_NONINTERACTIVE__" 1>&2
    exit 1
  fi
else
  echo "__ERR_NO_SUDO__" 1>&2
  exit 1
fi
