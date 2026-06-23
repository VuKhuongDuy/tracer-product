#!/usr/bin/env bash
# Đăng ký + enroll user có attribute (ABAC) vào wallet cho backend & script test.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TN="$REPO_ROOT/fabric-samples/test-network"
WALLET="$REPO_ROOT/app/server/wallet"
cd "$TN"
export PATH=${PWD}/../bin:$PATH
mkdir -p "$WALLET"

ORG3_CA=$(find "${PWD}" -path '*fabric-ca*' -path '*org3*' -name ca-cert.pem | head -1)

# enrollUser <caname> <port> <caTlsCert> <orgMspConfig> <user> <secret> <attrs>
enrollUser() {
  local caname=$1 port=$2 catls=$3 orgcfg=$4 user=$5 secret=$6 attrs=$7
  export FABRIC_CA_CLIENT_HOME=${PWD}/organizations/peerOrganizations/${orgcfg}/
  fabric-ca-client register --caname "$caname" --id.name "$user" --id.secret "$secret" \
    --id.type client --id.attrs "$attrs" --tls.certfiles "$catls" 2>/dev/null || true   # đã tồn tại thì bỏ qua
  fabric-ca-client enroll -u "https://${user}:${secret}@localhost:${port}" --caname "$caname" \
    -M "${WALLET}/${user}/msp" --tls.certfiles "$catls"
  cp "${PWD}/organizations/peerOrganizations/${orgcfg}/msp/config.yaml" "${WALLET}/${user}/msp/config.yaml"
  echo "enrolled: $user"
}

O1=${PWD}/organizations/fabric-ca/org1/ca-cert.pem
O2=${PWD}/organizations/fabric-ca/org2/ca-cert.pem

enrollUser ca-org1 7054  "$O1" org1.example.com farmerA  farmerApw  'role=farmer:ecert,farmerId=FARMER-A:ecert'
enrollUser ca-org1 7054  "$O1" org1.example.com farmerB  farmerBpw  'role=farmer:ecert,farmerId=FARMER-B:ecert'
enrollUser ca-org1 7054  "$O1" org1.example.com htxStaff htxStaffpw 'role=htx:ecert'
enrollUser ca-org2 8054  "$O2" org2.example.com retailer retailerpw 'role=retailer:ecert'
enrollUser ca-org3 11054 "$ORG3_CA" org3.example.com regulator regulatorpw 'role=regulator:ecert'

echo "== wallet =="
ls -1 "$WALLET"
