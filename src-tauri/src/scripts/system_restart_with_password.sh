PASS_B64='__PASS_B64__'
PASS="$(printf '%s' "$PASS_B64" | base64 -d)"

has() {
  command -v "$1" >/dev/null 2>&1
}

run() {
  if [ "$(id -u)" = "0" ]; then
    "$@"
  elif has sudo; then
    if printf '%s\n' "$PASS" | sudo -S -p '' -k -v >/dev/null 2>&1; then
      printf '%s\n' "$PASS" | sudo -S -p '' "$@"
    else
      echo "__ERR_BAD_SUDO_PASSWORD__" 1>&2
      return 1
    fi
  elif has su; then
    if printf '%s\n' "$PASS" | su -c 'true' root >/dev/null 2>&1; then
      printf '%s\n' "$PASS" | su -c "$*" root
    else
      echo "__ERR_BAD_SU_PASSWORD__" 1>&2
      return 1
    fi
  else
    return 127
  fi
}

if has systemctl; then
  run systemctl restart docker.service || run systemctl restart docker || {
    echo "__ERR_SYSTEMCTL__" 1>&2
    exit 1
  }
elif has rc-service; then
  run rc-service docker restart || {
    echo "__ERR_RC_SERVICE__" 1>&2
    exit 1
  }
elif has service; then
  run service docker restart || {
    echo "__ERR_SERVICE_OP__" 1>&2
    exit 1
  }
else
  echo "__ERR_NO_MANAGER__" 1>&2
  exit 1
fi
