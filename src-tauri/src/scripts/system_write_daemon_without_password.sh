printf '%s' '__CFG_B64__' | base64 -d | (sudo -n tee /etc/docker/daemon.json >/dev/null || tee /etc/docker/daemon.json >/dev/null)
