#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

command=${1:-}

build_css() {
  tailwindcss -i "$ROOT_DIR/app/styles/tailwind.css" -o "$ROOT_DIR/app/assets/tailwind.css"
}

watch_css() {
  tailwindcss -i "$ROOT_DIR/app/styles/tailwind.css" -o "$ROOT_DIR/app/assets/tailwind.css" --watch
}

start_server() {
  tsx "$ROOT_DIR/server.ts"
}

watch_server() {
  tsx watch "$ROOT_DIR/server.ts"
}

dev() {
  tailwindcss -i "$ROOT_DIR/app/styles/tailwind.css" -o "$ROOT_DIR/app/assets/tailwind.css" --watch &
  css_pid=$!
  tsx watch "$ROOT_DIR/server.ts" &
  server_pid=$!
  trap 'kill "$css_pid" "$server_pid" 2>/dev/null' INT TERM EXIT
  wait
}

case "$command" in
  dev)
    dev
    ;;
  start)
    start_server
    ;;
  dev:css)
    watch_css
    ;;
  build:css)
    build_css
    ;;
  test)
    tsx --test
    ;;
  typecheck)
    tsc --noEmit
    ;;
  *)
    printf 'Usage: %s {dev|start|dev:css|build:css|test|typecheck}\n' "$0" >&2
    exit 1
    ;;
esac
