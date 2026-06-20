#!/usr/bin/env bash
# Kiểm chứng API phản ánh đúng cưỡng chế Fabric theo role.
set -uo pipefail
cd /Users/alex/Project/hyperledger-fabric/app/server
node server.js > /tmp/api_srv.log 2>&1 & SRV=$!
sleep 3
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "PASS: $1"; pass=$((pass+1)); else echo "FAIL: $1 (got '$3' expect '$2')"; fail=$((fail+1)); fi; }

LOT="APIT-$(date +%s)"
# 1) farmerA tạo lô kèm pii+price
OK=$(curl -s -XPOST localhost:3000/api/lots -H 'content-type: application/json' \
  -d "{\"as\":\"farmerA\",\"id\":\"$LOT\",\"productName\":\"Sau rieng\",\"origin\":\"Dak Lak\",\"farmerID\":\"FARMER-A\",\"harvestDate\":\"2026-06-10\",\"quantityKg\":1000,\"pii\":{\"fullName\":\"A\",\"idNumber\":\"066\",\"phone\":\"0900\",\"plotLocation\":\"KP\"},\"price\":{\"buyPrice\":45000,\"sellPrice\":70000,\"currency\":\"VND\",\"party\":\"x\"}}" | jq -r '.ok')
chk "farmerA tạo lô qua API" "true" "$OK"
sleep 3

# 2) retailer (Org2): thấy price, KHÓA pii
R=$(curl -s "localhost:3000/api/lots/$LOT?as=retailer")
chk "retailer thấy price"  "false" "$(echo "$R" | jq -r '.price.locked')"
chk "retailer bị khóa pii" "true"  "$(echo "$R" | jq -r '.pii.locked')"

# 3) regulator (Org3): thấy pii, KHÓA price
G=$(curl -s "localhost:3000/api/lots/$LOT?as=regulator")
chk "regulator thấy pii"    "false" "$(echo "$G" | jq -r '.pii.locked')"
chk "regulator bị khóa price" "true" "$(echo "$G" | jq -r '.price.locked')"

# 4) trace công khai: KHÔNG có field private
T=$(curl -s "localhost:3000/api/trace/$LOT")
chk "trace có hành trình"   "true"  "$(echo "$T" | jq -r '(.provenance|length>0)')"
chk "trace không lộ price"   "null"  "$(echo "$T" | jq -r '.price')"

# 5) retailer tạo lô -> bị từ chối (ABAC)
ERR=$(curl -s -XPOST localhost:3000/api/lots -H 'content-type: application/json' \
  -d "{\"as\":\"retailer\",\"id\":\"${LOT}-x\",\"productName\":\"x\",\"origin\":\"y\",\"farmerID\":\"FARMER-A\",\"harvestDate\":\"2026-06-10\",\"quantityKg\":1}" | jq -r '.error // empty')
[ -n "$ERR" ] && { echo "PASS: retailer tạo lô bị từ chối"; pass=$((pass+1)); } || { echo "FAIL: retailer tạo lô không bị từ chối"; fail=$((fail+1)); }

kill $SRV 2>/dev/null
echo "----"; echo "PASS=$pass FAIL=$fail"; [ "$fail" -eq 0 ]
