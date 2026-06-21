#!/usr/bin/env bash
# Khởi động lại cụm orderer BFT khi consensus bị kẹt (không tạo block mới).
# Triệu chứng: peer chaincode invoke treo hoặc báo "timed out waiting for txid";
# demo.sh đứng im giữa chừng. Thường xảy ra sau khi máy macOS ngủ / Docker tạm dừng
# container, khiến smartbft mất nhịp tim và không bầu lại được leader/view.
#
# Cách dùng: bash scripts/restart-orderers.sh
set -euo pipefail

ORDERERS=(orderer.example.com orderer2.example.com orderer3.example.com orderer4.example.com)

echo "==> Khởi động lại ${#ORDERERS[@]} orderer…"
docker restart "${ORDERERS[@]}"

echo "==> Chờ consensus bầu lại view/leader…"
for i in $(seq 1 12); do
  sleep 5
  line=$(docker logs --tail 80 orderer.example.com 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | grep -iE 'Starting view|Committed block|decided' | tail -1)
  if [ -n "$line" ]; then
    echo "[$((i*5))s] $line"
    echo "✅ Orderer đã hoạt động trở lại. Thử chạy lại: bash scripts/demo.sh"
    exit 0
  fi
  echo "[$((i*5))s] đang chờ…"
done

echo "⚠ Chưa thấy dấu hiệu bầu view sau 60s. Kiểm tra: docker logs --tail 40 orderer.example.com" >&2
exit 1
