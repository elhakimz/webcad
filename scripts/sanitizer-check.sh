#!/usr/bin/env bash
#
# scripts/sanitizer-check.sh — CI-agnostic ASan/UBSan kernel build + crash-diagnostics smoke test.
#
# Builds the C++ kernel with -fsanitize=address,undefined, starts it briefly, and checks
# stderr for sanitizer violations or unexpected crashes.
#
# Usage: ./scripts/sanitizer-check.sh [kernel-source-dir]
#
# Exits 0 on pass / skip (toolchain unavailable). Exits non-zero on sanitizer violation
# or unexpected kernel crash.
#
# Designed to run in any CI (GitHub Actions, GitLab, local) — no CI provider lock-in.

set -euo pipefail

KERNEL_SRC="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Resolve kernel source dir relative to repo root if not absolute.
if [[ ! -d "${KERNEL_SRC}" ]]; then
  KERNEL_SRC="${REPO_ROOT}/${KERNEL_SRC}"
fi

CMAKE_BUILD_DIR="${KERNEL_SRC}/build-sanitizer"
KERNEL_BINARY="${CMAKE_BUILD_DIR}/kernel_worker"
STDERR_LOG="${CMAKE_BUILD_DIR}/sanitizer-stderr.log"
SOCKET_PATH="/tmp/webcad-kernel-sanitizer.sock"

log() { echo "[sanitizer-check] $*"; }

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------
have_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! have_cmd cmake; then
  log "SKIP: cmake not found — sanitizer build requires cmake."
  exit 0
fi

if ! have_cmd g++ && ! have_cmd c++; then
  log "SKIP: no C++ compiler (g++/c++) found — sanitizer build requires a C++ compiler."
  exit 0
fi

# OCCT headers are required to build the kernel. If missing, skip gracefully
# (CI provisioning is expected to install OCCT before running this script).
if ! ls /usr/local/include/opencascade/Standard_Failure.hxx \
      /opt/conda/include/opencascade/Standard_Failure.hxx \
      "${CONDA_PREFIX:-}/include/opencascade/Standard_Failure.hxx" \
      >/dev/null 2>&1; then
  log "SKIP: OpenCASCADE headers not found — kernel cannot be built without OCCT."
  log "      Install OCCT 7.9.3 (headers + libs) before running sanitizer checks in CI."
  exit 0
fi

# ---------------------------------------------------------------------------
# Build kernel with ASan/UBSan
# ---------------------------------------------------------------------------
log "Building kernel with ASan/UBSan in ${CMAKE_BUILD_DIR}..."

rm -rf "${CMAKE_BUILD_DIR}"
mkdir -p "${CMAKE_BUILD_DIR}"

cmake -S "${KERNEL_SRC}" -B "${CMAKE_BUILD_DIR}" \
  -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g -O0" \
  -DCMAKE_C_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g -O0" \
  -DCMAKE_EXE_LINKER_FLAGS="-fsanitize=address,undefined -fno-omit-frame-pointer -g" \
  >"${CMAKE_BUILD_DIR}/cmake-configure.log" 2>&1

cmake --build "${CMAKE_BUILD_DIR}" --target kernel_worker \
  >"${CMAKE_BUILD_DIR}/cmake-build.log" 2>&1

if [[ ! -x "${KERNEL_BINARY}" ]]; then
  log "FAIL: kernel_worker binary not produced at ${KERNEL_BINARY}"
  cat "${CMAKE_BUILD_DIR}/cmake-build.log"
  exit 1
fi

log "Build succeeded."

# ---------------------------------------------------------------------------
# Crash-diagnostics smoke test
# ---------------------------------------------------------------------------
log "Starting kernel with sanitizers enabled..."

rm -f "${SOCKET_PATH}" "${STDERR_LOG}"

# Start kernel in background, capture stderr for sanitizer violation scan.
"${KERNEL_BINARY}" "${SOCKET_PATH}" >"${CMAKE_BUILD_DIR}/sanitizer-stdout.log" 2>"${STDERR_LOG}" &
KERNEL_PID=$!

# Wait briefly for the socket to appear (kernel signals readiness via UDS socket).
KERNEL_STARTED=0
for _ in $(seq 1 30); do
  if [[ -S "${SOCKET_PATH}" ]]; then
    KERNEL_STARTED=1
    break
  fi
  # Kernel may have exited prematurely.
  if ! kill -0 "${KERNEL_PID}" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if [[ "${KERNEL_STARTED}" -ne 1 ]]; then
  log "FAIL: kernel process exited prematurely or socket did not appear."
  log "--- stdout ---"
  cat "${CMAKE_BUILD_DIR}/sanitizer-stdout.log" 2>/dev/null || true
  log "--- stderr ---"
  cat "${STDERR_LOG}" 2>/dev/null || true
  kill "${KERNEL_PID}" 2>/dev/null || true
  wait "${KERNEL_PID}" 2>/dev/null || true
  exit 1
fi

log "Kernel started successfully with sanitizers enabled."

# ---------------------------------------------------------------------------
# Check stderr for sanitizer violations
# ---------------------------------------------------------------------------
if grep -qE "ERROR: AddressSanitizer|runtime error:|SIGSEGV|SIGABRT|pure virtual method called|sanitizer" "${STDERR_LOG}" 2>/dev/null; then
  log "FAIL: sanitizer violations detected in kernel stderr."
  log "--- stderr ---"
  cat "${STDERR_LOG}"
  kill "${KERNEL_PID}" 2>/dev/null || true
  wait "${KERNEL_PID}" 2>/dev/null || true
  exit 1
fi

# ---------------------------------------------------------------------------
# Teardown
# ---------------------------------------------------------------------------
kill "${KERNEL_PID}" 2>/dev/null || true
wait "${KERNEL_PID}" 2>/dev/null || true
rm -f "${SOCKET_PATH}"

log "PASS: no sanitizer violations, no unexpected crashes."
