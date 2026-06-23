#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

VERSION="${VERSION:-1.14.2}"
IMAGE="jk-agent/dify-web:${VERSION}"

# Docker cannot read .dockerignore in this environment, so we pipe a filtered
# archive to docker build instead of sending the whole build context.
# Exclude patterns must work on both GNU tar (Linux) and BSD tar (macOS):
# do not use '**' globs — they are not supported by BSD tar.
TAR_EXCLUDES=(
    --exclude='./docker'
    --exclude='./.git'
    --exclude='./node_modules'
    --exclude='./web/node_modules'
    --exclude='./web/.next'
    --exclude='./web/dist'
    --exclude='./web/build'
    --exclude='./web/coverage'
    --exclude='./.DS_Store'
    --exclude='./api'
    --exclude='./dify-agent'
    --exclude='./node_modules'
)

# Prefer GNU tar when available (e.g. brew install gnu-tar on macOS).
if command -v gtar >/dev/null 2>&1; then
    TAR=(gtar)
else
    TAR=(tar)
fi

# Prevent macOS tar from bundling AppleDouble / resource-fork metadata.
export COPYFILE_DISABLE=1

echo "Building web image: ${IMAGE}"

"${TAR[@]}" "${TAR_EXCLUDES[@]}" -cf - . | docker build \
    --progress=plain \
    --build-arg NEXT_PUBLIC_BASE_PATH=/web \
    --build-arg NEXT_PUBLIC_ALLOW_EMBED=true \
    -f web/Dockerfile.jk \
    -t "${IMAGE}" \
    -
