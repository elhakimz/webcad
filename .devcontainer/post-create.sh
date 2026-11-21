#!/usr/bin/env bash
# .devcontainer/post-create.sh
# Post-create setup for the WebCAD kernel dev container.
#
# Installs the C++ build toolchain and protobuf/gRPC development headers
# needed to build the native OCCT kernel (kernel_worker).
#
# OCCT (OpenCASCADE 7.9.3) is intentionally NOT installed here — it must be
# provided separately, either from source (see Dockerfile.kernel) or from
# conda-forge `occt`/`novtk` via micromamba. See
# docs/superpowers/plans/2026-11-20-dev-environment.md for both options.

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

echo "==> [post-create] apt-get update"
apt-get update

echo "==> [post-create] installing build essentials and kernel dependencies"
apt-get install -y --no-install-recommends \
  build-essential \
  cmake \
  ninja-build \
  ccache \
  lld \
  gdb \
  lldb \
  libprotobuf-dev \
  protobuf-compiler \
  libgrpc-dev \
  protobuf-compiler-grpc \
  ca-certificates \
  curl \
  tar \
  xz-utils \
  && rm -rf /var/lib/apt/lists/*

# mold is not in the Ubuntu 22.04 apt repositories; lld (installed above) is
# the CMake fallback linker. Install mold from a GitHub release (best-effort).
install_mold() {
  local version="2.3.3"
  local arch tarball url
  arch="$(uname -m)"
  case "$arch" in
    x86_64) tarball="mold-${version}-x86_64-linux.tar.gz" ;;
    aarch64) tarball="mold-${version}-aarch64-linux.tar.gz" ;;
    *)
      echo "==> [post-create] mold: unsupported arch ${arch} — skipping (lld fallback)"
      return 0
      ;;
  esac
  url="https://github.com/rui314/mold/releases/download/v${version}/${tarball}"
  echo "==> [post-create] installing mold ${version} for ${arch}"
  if curl -fsSL "${url}" -o /tmp/mold.tar.gz \
     && tar -xzf /tmp/mold.tar.gz -C /tmp \
     && install -m 0755 /tmp/mold-${version}-*/bin/mold /usr/local/bin/mold; then
    rm -f /tmp/mold.tar.gz
    rm -rf /tmp/mold-${version}-* 2>/dev/null || true
    echo "==> [post-create] mold installed at $(command -v mold)"
  else
    echo "==> [post-create] mold install failed — skipping (lld fallback)"
    rm -f /tmp/mold.tar.gz
    rm -rf /tmp/mold-${version}-* 2>/dev/null || true
  fi
}

install_mold || true

echo "==> [post-create] toolchain:"
for tool in g++ gcc cmake ninja ccache mold ld.lld gdb lldb protoc grpc_cpp_plugin; do
  if command -v "${tool}" >/dev/null 2>&1; then
    echo "   ${tool}: $(command -v "${tool}")"
  else
    echo "   ${tool}: NOT FOUND"
  fi
done

echo "==> [post-create] done."
echo "   Next steps:"
echo "   1. Install OCCT 7.9.3 (from source or conda-forge novtk) — see docs/superpowers/plans/2026-11-20-dev-environment.md"
echo "   2. Run: ./scripts/verify-kernel.sh"
