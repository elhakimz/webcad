#!/usr/bin/env bash
# CI check: verify protobuf/gRPC runtime versions match generated code.
# Fails on version mismatch between protoc, generated code, and runtime.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSIONS_FILE="${REPO_ROOT}/proto/versions.txt"

if [[ ! -f "${VERSIONS_FILE}" ]]; then
  echo "ERROR: versions file not found: ${VERSIONS_FILE}"
  exit 1
fi

# Source version pins
# shellcheck source=/dev/null
source "${VERSIONS_FILE}"

FAIL=0

# 1. Check protoc version matches pin
PROTOC_ACTUAL=$(protoc --version 2>/dev/null | awk '{print $2}' || echo "unknown")
if [[ "${PROTOC_ACTUAL}" != "${PROTOC_VERSION}" ]]; then
  echo "FAIL: protoc version mismatch: expected ${PROTOC_VERSION}, found ${PROTOC_ACTUAL}"
  FAIL=1
else
  echo "OK: protoc ${PROTOC_ACTUAL} matches pin"
fi

# 2. Check C++ protobuf library version matches pin
if dpkg -l libprotobuf-dev 2>/dev/null | grep -q "^ii"; then
  CPP_PROTO_ACTUAL=$(dpkg -l libprotobuf-dev 2>/dev/null | awk '/^ii/{print $3}')
  if [[ "${CPP_PROTO_ACTUAL}" != "${CPP_PROTOBUF_VERSION}" ]]; then
    echo "FAIL: C++ protobuf version mismatch: expected ${CPP_PROTOBUF_VERSION}, found ${CPP_PROTO_ACTUAL}"
    FAIL=1
  else
    echo "OK: C++ protobuf ${CPP_PROTO_ACTUAL} matches pin"
  fi
fi

# 3. Check C++ gRPC library version matches pin
if dpkg -l libgrpc-dev 2>/dev/null | grep -q "^ii"; then
  CPP_GRPC_ACTUAL=$(dpkg -l libgrpc-dev 2>/dev/null | awk '/^ii/{print $3}')
  if [[ "${CPP_GRPC_ACTUAL}" != "${CPP_GRPC_VERSION}" ]]; then
    echo "FAIL: C++ gRPC version mismatch: expected ${CPP_GRPC_VERSION}, found ${CPP_GRPC_ACTUAL}"
    FAIL=1
  else
    echo "OK: C++ gRPC ${CPP_GRPC_ACTUAL} matches pin"
  fi
fi

# 4. Check TypeScript protobuf runtime version matches pin
if [[ -f "${REPO_ROOT}/package.json" ]]; then
  TS_PROTO_ACTUAL=$(node -e "console.log(require('${REPO_ROOT}/package.json').dependencies['@bufbuild/protobuf'] || 'unknown')" 2>/dev/null || echo "unknown")
  if [[ "${TS_PROTO_ACTUAL}" != "${BUILDP_PROTOBUF_VERSION}" ]]; then
    echo "FAIL: TS @bufbuild/protobuf version mismatch: expected ${BUILDP_PROTOBUF_VERSION}, found ${TS_PROTO_ACTUAL}"
    FAIL=1
  else
    echo "OK: TS @bufbuild/protobuf ${TS_PROTO_ACTUAL} matches pin"
  fi
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo ""
  echo "Version mismatch detected. Update proto/versions.txt and regenerate code."
  exit 1
fi

echo ""
echo "All proto version checks passed."
