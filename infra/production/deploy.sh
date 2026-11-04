#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

if [[ ${EUID} -ne 0 ]]; then
  echo "Phải chạy lotusgather-deploy bằng sudo." >&2
  exit 1
fi

release_id=${1:-}
artifact=${2:-}
if [[ ! $release_id =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Release id không hợp lệ." >&2
  exit 1
fi
if [[ $artifact != "/tmp/lotusgather-${release_id}.tar.gz" || ! -f $artifact || -L $artifact ]]; then
  echo "Gói release không hợp lệ." >&2
  exit 1
fi

config=/etc/lotusgather/deploy.conf
if [[ ! -r $config ]]; then
  echo "Thiếu $config" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$config"

: "${APP_ROOT:=/opt/lotusgather}"
: "${APP_USER:=lotusgather}"
: "${WEB_UNIT:=lotusgather-web.service}"
: "${WEB_HEALTH_URL:=http://127.0.0.1:3000/}"
: "${API_UNIT:=lotusgather-api.service}"
: "${API_HEALTH_URL:=http://127.0.0.1:4000/health}"
if [[ ${#REALTIME_UNITS[@]} -lt 2 || ${#REALTIME_UNITS[@]} -ne ${#REALTIME_HEALTH_URLS[@]} ]]; then
  echo "Production cần ít nhất hai realtime unit và mỗi unit phải có health URL tương ứng." >&2
  exit 1
fi

releases="$APP_ROOT/releases"
release="$releases/$release_id"
staging="$releases/.${release_id}.staging"
current="$APP_ROOT/current"
previous=''
switched=0
if [[ -L $current ]]; then previous=$(readlink -f "$current"); fi

wait_health() {
  local url=$1
  for _ in {1..30}; do
    if curl --fail --silent --show-error --max-time 3 "$url" >/dev/null; then return 0; fi
    sleep 2
  done
  echo "Health check thất bại: $url" >&2
  return 1
}

restart_all() {
  systemctl restart "$API_UNIT"
  wait_health "$API_HEALTH_URL"
  systemctl restart "$WEB_UNIT"
  wait_health "$WEB_HEALTH_URL"
  local index
  for index in "${!REALTIME_UNITS[@]}"; do
    systemctl restart "${REALTIME_UNITS[$index]}"
    wait_health "${REALTIME_HEALTH_URLS[$index]}"
  done
}

rolling_realtime() {
  local index other healthy
  for index in "${!REALTIME_UNITS[@]}"; do
    healthy=0
    for other in "${!REALTIME_UNITS[@]}"; do
      if [[ $other -ne $index ]] && curl --fail --silent --max-time 3 "${REALTIME_HEALTH_URLS[$other]}" >/dev/null; then
        healthy=1
        break
      fi
    done
    if [[ $healthy -ne 1 ]]; then
      echo "Không còn realtime node khỏe để nhận phòng khi rút ${REALTIME_UNITS[$index]}." >&2
      return 1
    fi
    # SIGTERM hiện ghi snapshot, trả lease rồi client nối sang node còn lại. Chỉ cập nhật từng node một.
    systemctl restart "${REALTIME_UNITS[$index]}"
    wait_health "${REALTIME_HEALTH_URLS[$index]}"
  done
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ $switched -eq 1 && -n $previous && -d $previous ]]; then
    echo "Deploy lỗi, quay lại $previous" >&2
    ln -sfn "$previous" "$current"
    restart_all || true
  fi
  exit "$exit_code"
}
trap rollback ERR

install -d -o "$APP_USER" -g "$APP_USER" "$releases"
if [[ ! -d $release ]]; then
  rm -rf -- "$staging"
  install -d -o "$APP_USER" -g "$APP_USER" "$staging"
  tar --extract --gzip --file "$artifact" --directory "$staging" --no-same-owner --no-same-permissions
  chown -R "$APP_USER:$APP_USER" "$staging"
  runuser -u "$APP_USER" -- bash -lc "cd '$staging' && npm ci --omit=dev --ignore-scripts"
  mv "$staging" "$release"
fi
rm -f "$artifact"

# SQLite đang ở WAL: dùng lệnh backup nhất quán trước khi đổi phiên bản nếu máy có sqlite3.
if command -v sqlite3 >/dev/null && [[ -f /var/lib/lotusgather/app.db ]]; then
  install -d -m 0750 -o "$APP_USER" -g "$APP_USER" /var/backups/lotusgather
  backup="/var/backups/lotusgather/app-${release_id}.db"
  runuser -u "$APP_USER" -- sqlite3 /var/lib/lotusgather/app.db ".backup '$backup'"
fi

ln -sfn "$release" "$current"
switched=1
systemctl restart "$API_UNIT"
wait_health "$API_HEALTH_URL"
systemctl restart "$WEB_UNIT"
wait_health "$WEB_HEALTH_URL"
rolling_realtime

trap - ERR
echo "Deploy $release_id hoàn tất. Web, API và ${#REALTIME_UNITS[@]} realtime node đều khỏe."
