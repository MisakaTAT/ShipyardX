has() {
  command -v "$1" >/dev/null 2>&1
}

run() {
  if [ "$(id -u)" = "0" ]; then
    "$@"
  elif has sudo; then
    if sudo -n true 2>/dev/null; then
      sudo -n "$@"
    else
      echo "__ERR_SUDO_NONINTERACTIVE__" 1>&2
      exit 1
    fi
  else
    echo "__ERR_NO_SUDO__" 1>&2
    exit 1
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
