CFG_B64='__CFG_B64__'
PASS_B64='__PASS_B64__'
PASS="$(printf '%s' "$PASS_B64" | base64 -d)"

if [ "$(id -u)" = "0" ]; then
  printf '%s' "$CFG_B64" | base64 -d | tee /etc/docker/daemon.json >/dev/null
elif command -v sudo >/dev/null 2>&1; then
  if printf '%s\n' "$PASS" | sudo -S -p '' -k -v >/dev/null 2>&1; then
    printf '%s\n' "$PASS" | sudo -S -p '' sh -c "printf '%s' '$CFG_B64' | base64 -d | tee /etc/docker/daemon.json >/dev/null"
  else
    echo "__ERR_BAD_SUDO_PASSWORD__" 1>&2
    exit 1
  fi
elif command -v su >/dev/null 2>&1; then
  if printf '%s\n' "$PASS" | su -c 'true' root >/dev/null 2>&1; then
    printf '%s\n' "$PASS" | su -c "printf '%s' '$CFG_B64' | base64 -d | tee /etc/docker/daemon.json >/dev/null" root
  else
    echo "__ERR_BAD_SU_PASSWORD__" 1>&2
    exit 1
  fi
else
  exit 1
fi
