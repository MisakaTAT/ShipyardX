mkdir -p "__REMOTE_DIR__" &&
printf '%s' "__TAR_B64__" | base64 -d | tar -xzf - -C "__REMOTE_PARENT__"
