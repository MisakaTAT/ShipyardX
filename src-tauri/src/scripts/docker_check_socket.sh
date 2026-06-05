if [ ! -S "__SOCKET_PATH__" ]; then
  echo 'no_docker'
elif [ ! -r "__SOCKET_PATH__" ]; then
  echo 'no_permission'
else
  echo 'ok'
fi
