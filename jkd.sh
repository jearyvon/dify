#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker/docker-compose-jk.yaml"
JK_VERSION="1.0.0"

usage() {
    cat <<'EOF'
用法: jkd.sh [-v <version>] [命令]

选项:
  -v <version>  指定 jk_web / jk_api 镜像版本（对应 JK_WEB_VERSION、JK_API_VERSION）
                不传则使用 docker-compose-jk.yaml 或 docker/.env 中的默认值

命令:
  start    启动服务
  stop     停止服务
  restart  重启服务（默认）
  help     显示帮助

示例:
  ./jkd.sh                          # 等同于 restart
  ./jkd.sh start
  ./jkd.sh -v 1.0.0 start          # 使用指定版本启动
  ./jkd.sh -v 1.0.0 restart        # 指定版本时会重新 up 以拉取/切换镜像
EOF
}

while getopts ":v:h" opt; do
    case "${opt}" in
        v)
            JK_VERSION="${OPTARG}"
            ;;
        h)
            usage
            exit 0
            ;;
        \?)
            echo "未知选项: -${OPTARG}" >&2
            usage >&2
            exit 1
            ;;
        :)
            echo "选项 -${OPTARG} 需要参数。" >&2
            usage >&2
            exit 1
            ;;
    esac
done

shift $((OPTIND - 1))

if [[ -n "${JK_VERSION}" ]]; then
    export JK_WEB_VERSION="${JK_VERSION}"
    export JK_API_VERSION="${JK_VERSION}"
    echo "使用镜像版本: ${JK_VERSION}"
fi

compose() {
    docker compose -f "${COMPOSE_FILE}" "$@"
}

start() {
    compose up -d
}

stop() {
    compose down --remove-orphans
}

restart() {
    if [[ -n "${JK_VERSION}" ]]; then
        compose up -d
    else
        compose restart
    fi
}

main() {
    local cmd="${1:-restart}"

    case "${cmd}" in
        start)
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        help | -h | --help)
            usage
            ;;
        *)
            echo "未知命令: ${cmd}" >&2
            echo >&2
            usage >&2
            exit 1
            ;;
    esac
}

main "$@"
