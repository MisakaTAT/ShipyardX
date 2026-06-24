TMP_PATH=__TMP_PATH__
PASS_B64='__PASS_B64__'
PASS="$(printf '%s' "$PASS_B64" | base64 -d)"

trap 'rm -f "$TMP_PATH"' EXIT

if [ "$(id -u)" = "0" ]; then
  install -m 0644 "$TMP_PATH" /etc/docker/daemon.json
elif command -v sudo >/dev/null 2>&1; then
  if printf '%s\n' "$PASS" | sudo -S -p '' -k -v >/dev/null 2>&1; then
    printf '%s\n' "$PASS" | sudo -S -p '' install -m 0644 "$TMP_PATH" /etc/docker/daemon.json
  else
    echo "__ERR_BAD_SUDO_PASSWORD__" 1>&2
    exit 1
  fi
elif command -v su >/dev/null 2>&1; then
  if printf '%s\n' "$PASS" | su -c 'true' root >/dev/null 2>&1; then
    printf '%s\n' "$PASS" | su -c "install -m 0644 \"$TMP_PATH\" /etc/docker/daemon.json" root
  else
    echo "__ERR_BAD_SU_PASSWORD__" 1>&2
    exit 1
  fi
else
  echo "__ERR_NO_SUDO__" 1>&2
  exit 1
fi
