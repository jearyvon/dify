#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker/docker-compose-jk.yaml"
DOCKER_ENV_DIR="${SCRIPT_DIR}/docker"
JK_VERSION="1.0.0"
JK_ENV=""

usage() {
    cat <<'EOF'
用法: jkd.sh [-v <version>] [-e <env>] [命令]

选项:
  -v <version>  指定 jk_web / jk_api 镜像版本（对应 JK_WEB_VERSION、JK_API_VERSION）
                不传则使用 docker-compose-jk.yaml 或 docker/.env 中的默认值
  -e <env>      指定运行环境：dev | preview | prod（仅 start / restart 支持）
                会将 docker/.env.jk.<env> 复制为 docker/.env 后再执行命令
                不传 -e 时不修改 docker/.env，直接使用现有配置

命令:
  start    启动服务
  stop     停止服务
  restart  重启服务（默认）
  help     显示帮助

示例:
  ./jkd.sh                          # 等同于 restart
  ./jkd.sh start
  ./jkd.sh -e dev start             # 使用 dev 环境配置启动
  ./jkd.sh -e preview restart       # 使用 preview 环境配置重启
  ./jkd.sh -v 1.0.0 -e prod start   # 指定版本与环境后启动
  ./jkd.sh -v 1.0.0 restart         # 指定版本时会重新 up 以拉取/切换镜像
EOF
}

validate_env() {
    case "${JK_ENV}" in
        dev | preview | prod) ;;
        *)
            echo "无效环境: ${JK_ENV}（支持: dev、preview、prod）" >&2
            exit 1
            ;;
    esac
}

apply_env() {
    local src="${DOCKER_ENV_DIR}/.env.jk.${JK_ENV}"
    local dst="${DOCKER_ENV_DIR}/.env"

    if [[ ! -f "${src}" ]]; then
        echo "环境文件不存在: ${src}" >&2
        exit 1
    fi

    cp -f "${src}" "${dst}"
    echo "已应用环境配置: ${JK_ENV}（${src} -> ${dst}）"
}

while getopts ":v:e:h" opt; do
    case "${opt}" in
        v)
            JK_VERSION="${OPTARG}"
            ;;
        e)
            JK_ENV="${OPTARG}"
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

    if [[ -n "${JK_ENV}" ]]; then
        case "${cmd}" in
            start | restart) ;;
            *)
                echo "选项 -e 仅支持 start 和 restart 命令。" >&2
                exit 1
                ;;
        esac
        validate_env
        apply_env
    fi

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
