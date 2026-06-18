#!/bin/bash

set -euo pipefail

DEFAULT_VERSION="1.14.2"
version="${DEFAULT_VERSION}"
build_target=""

usage() {
    cat <<EOF
Usage: $(basename "$0") [-v <version>] [web|api|all]

Options:
  -v <version>  Docker image version tag (default: ${DEFAULT_VERSION})

Arguments:
  web           Build web image only
  api           Build api image only
  all           Build both web and api images

If no build target is specified, the script will not build any image.
EOF
}

while getopts ":v:h" opt; do
    case "${opt}" in
        v)
            version="${OPTARG}"
            ;;
        h)
            usage
            exit 0
            ;;
        \?)
            echo "Invalid option: -${OPTARG}" >&2
            usage
            exit 1
            ;;
        :)
            echo "Option -${OPTARG} requires an argument." >&2
            usage
            exit 1
            ;;
    esac
done

shift $((OPTIND - 1))

if [[ $# -gt 0 ]]; then
    build_target="$1"
    if [[ $# -gt 1 ]]; then
        echo "Error: too many arguments." >&2
        usage
        exit 1
    fi
    case "${build_target}" in
        web | api | all) ;;
        *)
            echo "Error: unknown build target '${build_target}'." >&2
            usage
            exit 1
            ;;
    esac
fi

WEB_IMAGE="jk-agent/dify-web:${version}"
API_IMAGE="jk-agent/dify-api:${version}"

build_web() {
    echo "Building web image: ${WEB_IMAGE}"
    docker build \
        --build-arg NEXT_PUBLIC_BASE_PATH=/web \
        -f web/Dockerfile.jk \
        -t "${WEB_IMAGE}" \
        .
}

build_api() {
    echo "Building api image: ${API_IMAGE}"

    local dockerignore_backup=""
    local had_dockerignore=false

    if [[ -f .dockerignore ]]; then
        had_dockerignore=true
        dockerignore_backup="$(mktemp)"
        cp .dockerignore "${dockerignore_backup}"
    fi

    restore_dockerignore() {
        if [[ "${had_dockerignore}" == true ]]; then
            cp "${dockerignore_backup}" .dockerignore
            rm -f "${dockerignore_backup}"
        else
            rm -f .dockerignore
        fi
    }

    trap restore_dockerignore RETURN
    cp api/Dockerfile.dockerignore .dockerignore

    docker build -f api/Dockerfile.jk -t "${API_IMAGE}" .
}

build_all() {
    build_web
    build_api
}

if [[ -z "${build_target}" ]]; then
    echo "No build target specified. Nothing to do."
    usage
    exit 0
fi

case "${build_target}" in
    web) build_web ;;
    api) build_api ;;
    all) build_all ;;
esac
