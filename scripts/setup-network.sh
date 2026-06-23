#!/usr/bin/env bash
#
# One-shot setup of the Hyperledger Fabric traceability network on a fresh server.
#
# Brings up: 4-orderer BFT (SmartBFT) network + 3 organizations (Org1, Org2,
# Org3=regulator) + the `produce` chaincode (with private-data collections) +
# ABAC user identities. Does NOT install the app or explorer.
#
# Prerequisites on the target server: docker (running), git, curl, jq, go.
# Run from anywhere inside the repo; paths are derived from the repo root.
#
# Usage:
#   bash scripts/setup-network.sh                # full setup on a clean server
#   bash scripts/setup-network.sh --clean        # tear the network down first, then rebuild
#   bash scripts/setup-network.sh -c mychannel -f 3.1.5 -C 1.5.21
#
# Note: re-running on an already-running network is not supported; use --clean.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TN="$REPO_ROOT/fabric-samples/test-network"
CC="$REPO_ROOT/chaincode/produce-traceability"

# ---- defaults ----
CHANNEL="mychannel"
FABRIC_VERSION="3.1.5"
CA_VERSION="1.5.21"
CLEAN="false"

# ---- parse flags ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean) CLEAN="true"; shift ;;
    -c) CHANNEL="$2"; shift 2 ;;
    -f) FABRIC_VERSION="$2"; shift 2 ;;
    -C) CA_VERSION="$2"; shift 2 ;;
    -h|--help)
      awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

STEP="init"
trap 'echo; echo ">>> FAILED at step [$STEP] (line $LINENO). See output above." >&2' ERR

banner() { echo; echo "============================================================"; echo "==> $1"; echo "============================================================"; }

# ------------------------------------------------------------------ #
# Step 0 — preflight: required tooling
# ------------------------------------------------------------------ #
STEP="0/preflight"
banner "Step 0 — Preflight checks"
missing=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "  [MISSING] $1 — $2" >&2; missing=1
  else
    echo "  [ok] $1"
  fi
}
need docker "install Docker Engine and ensure your user can run it"
need git    "install git"
need curl   "install curl"
need jq     "install jq (e.g. apt-get install -y jq)"
need go     "install Go >= 1.20 (required to build the chaincode)"
if [[ $missing -ne 0 ]]; then
  echo "Aborting: install the missing tools above and re-run." >&2; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Aborting: docker is installed but the daemon is not reachable (is it running? do you have permission?)." >&2
  exit 1
fi
echo "  [ok] docker daemon reachable"

# ------------------------------------------------------------------ #
# Step 1 — download Fabric (binaries + docker images + samples)
# ------------------------------------------------------------------ #
STEP="1/install-fabric"
banner "Step 1 — Install Fabric ${FABRIC_VERSION} (CA ${CA_VERSION})"
if [[ -x "$REPO_ROOT/fabric-samples/bin/peer" ]]; then
  echo "  fabric-samples/bin/peer already present — skipping download."
else
  ( cd "$REPO_ROOT" && bash install-fabric.sh -f "$FABRIC_VERSION" -c "$CA_VERSION" docker binary samples )
fi

# Make the Fabric binaries available to this shell for the smoke test below.
export PATH="$REPO_ROOT/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$REPO_ROOT/fabric-samples/config"

# ------------------------------------------------------------------ #
# Optional teardown
# ------------------------------------------------------------------ #
if [[ "$CLEAN" == "true" ]]; then
  STEP="clean/down"
  banner "Tearing down any existing network (--clean)"
  ( cd "$TN" && ./network.sh down )
fi

# ------------------------------------------------------------------ #
# Step 2 — bring up the BFT network + create channel + Fabric CA
# ------------------------------------------------------------------ #
STEP="2/network-up"
banner "Step 2 — Start BFT network (4 orderers) + channel '${CHANNEL}'"
( cd "$TN" && ./network.sh up createChannel -bft -ca -c "$CHANNEL" )

# ------------------------------------------------------------------ #
# Step 3 — add Org3 (regulator) and join the channel
# ------------------------------------------------------------------ #
STEP="3/add-org3"
banner "Step 3 — Add Org3 (regulator) and join channel"
( cd "$TN/addOrg3" && ./addOrg3.sh up -c "$CHANNEL" -ca )

# ------------------------------------------------------------------ #
# Step 4 — deploy the produce chaincode (Org1 + Org2) with collections
# ------------------------------------------------------------------ #
STEP="4/deploy-cc"
banner "Step 4 — Deploy chaincode 'produce' (with private-data collections)"
( cd "$TN" && ./network.sh deployCC \
    -ccn produce \
    -ccp "$CC" \
    -ccl go \
    -c "$CHANNEL" \
    -cccg "$CC/collections_config.json" )

# ------------------------------------------------------------------ #
# Step 5 — install + approve on Org3 so it can endorse too
# ------------------------------------------------------------------ #
STEP="5/org3-endorse"
banner "Step 5 — Install + approve chaincode on peer0.org3"
bash "$REPO_ROOT/scripts/install-org3.sh" 1.0 1

# ------------------------------------------------------------------ #
# Step 6 — register ABAC user identities into the wallet
# ------------------------------------------------------------------ #
STEP="6/register-users"
banner "Step 6 — Register ABAC user identities"
bash "$REPO_ROOT/scripts/register-users.sh"

# ------------------------------------------------------------------ #
# Step 7 — smoke test
# ------------------------------------------------------------------ #
STEP="7/smoke-test"
banner "Step 7 — Smoke test"

echo "-- Orderer containers (expect 4x Up) --"
docker ps --filter "name=orderer" --format '  {{.Names}}\t{{.Status}}'

echo "-- Query GetAllLots via peer0.org1 --"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE="$TN/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="$TN/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051
peer chaincode query -C "$CHANNEL" -n produce -c '{"Args":["GetAllLots"]}' || {
  echo ">>> GetAllLots query failed — the chaincode may not be fully committed yet." >&2
  exit 1
}

STEP="done"
banner "DONE — network is up: 4-orderer BFT, 3 orgs, chaincode 'produce', ABAC users"
echo "Channel : $CHANNEL"
echo "Wallet  : $REPO_ROOT/app/server/wallet"
echo "Inspect : bash scripts/inspect.sh"
