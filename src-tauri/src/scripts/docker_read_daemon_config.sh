if [ -r /etc/docker/daemon.json ]; then
  cat /etc/docker/daemon.json
else
  echo '{}'
fi
