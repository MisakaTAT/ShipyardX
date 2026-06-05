if command -v nc >/dev/null 2>&1; then
  nc -z -w 2 __HOST__ __PORT__ >/dev/null 2>&1 && echo ok || echo no_docker
else
  echo ok
fi
