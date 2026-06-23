# Design: One-shot Fabric network setup script for a new server

**Date:** 2026-06-23
**Status:** Approved (design phase)

## Goal

Provide a single bash entrypoint that, on a fresh Linux server (Docker already
installed) holding a clone of this repo, brings up the complete Fabric blockchain
network: 4-orderer BFT (SmartBFT) consensus, 3 organizations, the `produce`
traceability chaincode (with private-data collections), and ABAC user identities.

App and Explorer are explicitly **out of scope** — only the network + chaincode +
identities.

## Why this is needed

- `install-fabric.sh` only downloads/prepares (samples repo, binaries, docker
  images). It does not start nodes, create channels, or deploy chaincode.
- The existing helper scripts (`install-org3.sh`, `register-users.sh`) hardcode
  absolute paths (`/Users/alex/Project/...`) so they cannot run on another server.
- The README quick-start omits `-cccg` (collections config), which would cause a
  chaincode definition mismatch between Org1/Org2 (commit) and Org3 (approve).

## Approach (chosen)

A new orchestrator script `scripts/setup-network.sh` that derives all paths
relative to the repo root and calls the helper scripts. The two broken helper
scripts are fixed to be path-portable (they are broken today anyway), so they work
both standalone and when called by the orchestrator.

### Path portability convention

Each script derives:

```bash
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TN="$REPO_ROOT/fabric-samples/test-network"
CC="$REPO_ROOT/chaincode/produce-traceability"
WALLET="$REPO_ROOT/app/server/wallet"
```

No hardcoded `/Users/...` paths remain.

## Components

### 1. `scripts/setup-network.sh` (new — orchestrator)

`set -euo pipefail` + an `ERR` trap that prints which numbered step failed.

| Step | Action | Command (essence) |
|------|--------|-------------------|
| 0 | Preflight | Verify `docker` (daemon reachable), `git`, `curl`, `jq`, `go` present; clear error + exit on any missing |
| 1 | Install Fabric | `bash install-fabric.sh -f 3.1.5 -c 1.5.21 docker binary samples` — skipped if `fabric-samples/bin/peer` already exists |
| 2 | Up network | `cd $TN && ./network.sh up createChannel -bft -ca -c mychannel` |
| 3 | Add Org3 | `cd $TN/addOrg3 && ./addOrg3.sh up -c mychannel -ca` |
| 4 | Deploy chaincode | `./network.sh deployCC -ccn produce -ccp $CC -ccl go -c mychannel -cccg $CC/collections_config.json` |
| 5 | Org3 endorse | `bash scripts/install-org3.sh 1.0 1` |
| 6 | Register users | `bash scripts/register-users.sh` |
| 7 | Smoke test | Print 4 orderer container status; query `GetAllLots` to confirm the network answers |

**Flags:**
- `--clean` — run `network.sh down` (and remove generated artifacts) before step 2, for a re-runnable fresh start.
- `-c <channel>` — channel name (default `mychannel`).
- `-f <ver>` / `-C <caver>` — Fabric / CA versions (defaults 3.1.5 / 1.5.21).

**Idempotency:** step 1 is skipped if binaries exist. Steps 2-6 assume a clean
network; re-running without `--clean` on a live network is not supported (documented
in the script header). Use `--clean` to redo.

### 2. `scripts/install-org3.sh` (fixed)

Replace hardcoded `TN`, `CC`, and `--collections-config` paths with the
`REPO_ROOT`-derived values. Behavior otherwise unchanged: package with deterministic
label `produce_<version>`, install on peer0.org3, approve with matching
version/sequence **and the same collections config** used at deploy (so the
definition matches the committed one).

### 3. `scripts/register-users.sh` (fixed)

Replace hardcoded `TN` and `WALLET` with `REPO_ROOT`-derived values. Behavior
otherwise unchanged: register+enroll farmerA/farmerB/htxStaff (Org1), retailer
(Org2), regulator (Org3) with ABAC attributes into `app/server/wallet/`.

## Error handling

- `set -euo pipefail` in all three scripts.
- `setup-network.sh` installs an `ERR` trap printing the current step label and the
  failing line, so a partial failure is diagnosable.
- Preflight fails fast with actionable messages (e.g. "go not found — required to
  build the chaincode; install Go >= 1.20").

## Testing / verification

This is infra orchestration; verification is by running it. The script's own
step 7 smoke test (`GetAllLots` returns + 4 orderers `Up`) is the success signal.
We cannot fully run it here (would need a clean server), so verification is:
1. `bash -n` syntax check on all three scripts.
2. Manual review that no hardcoded `/Users/...` paths remain (`grep`).
3. The collections-config consistency between step 4 and step 5 is correct by
   construction (same file passed to both).

## Out of scope

- Installing Docker / Go / jq (preflight only checks and instructs).
- App backend and Explorer.
- Multi-host distribution (all 3 orgs run on the single target server's Docker).
- Production hardening (TLS cert rotation, external CA, secrets management).
