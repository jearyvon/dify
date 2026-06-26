#!/bin/bash

HTTPS_CONFIG=''

if [ "${NGINX_HTTPS_ENABLED}" = "true" ]; then
    # Check if the certificate and key files for the specified domain exist
    if [ -n "${CERTBOT_DOMAIN}" ] && \
       [ -f "/etc/letsencrypt/live/${CERTBOT_DOMAIN}/${NGINX_SSL_CERT_FILENAME}" ] && \
       [ -f "/etc/letsencrypt/live/${CERTBOT_DOMAIN}/${NGINX_SSL_CERT_KEY_FILENAME}" ]; then
        SSL_CERTIFICATE_PATH="/etc/letsencrypt/live/${CERTBOT_DOMAIN}/${NGINX_SSL_CERT_FILENAME}"
        SSL_CERTIFICATE_KEY_PATH="/etc/letsencrypt/live/${CERTBOT_DOMAIN}/${NGINX_SSL_CERT_KEY_FILENAME}"
    else
        SSL_CERTIFICATE_PATH="/etc/ssl/${NGINX_SSL_CERT_FILENAME}"
        SSL_CERTIFICATE_KEY_PATH="/etc/ssl/${NGINX_SSL_CERT_KEY_FILENAME}"
    fi
    export SSL_CERTIFICATE_PATH
    export SSL_CERTIFICATE_KEY_PATH

    # set the HTTPS_CONFIG environment variable to the content of the https.conf.template
    HTTPS_CONFIG=$(envsubst < /etc/nginx/https.conf.template)
    cat /etc/nginx/http-redirect.conf.template > /etc/nginx/http-redirect.include
else
    echo '# HTTP to HTTPS redirect disabled' > /etc/nginx/http-redirect.include
fi
export HTTPS_CONFIG

if [ "${NGINX_ENABLE_CERTBOT_CHALLENGE}" = "true" ]; then
    ACME_CHALLENGE_LOCATION='location /.well-known/acme-challenge/ { root /var/www/html; }'
else
    ACME_CHALLENGE_LOCATION=''
fi
export ACME_CHALLENGE_LOCATION

DEFAULT_CONF_VARS='$NGINX_PORT $NGINX_SERVER_NAME $ACME_CHALLENGE_LOCATION $HTTPS_CONFIG $JK_API_UPSTREAM $NGINX_SOCKET_IO_UPSTREAM'
NGINX_CONF_VARS='$NGINX_WORKER_PROCESSES $NGINX_KEEPALIVE_TIMEOUT $NGINX_CLIENT_MAX_BODY_SIZE'
PROXY_CONF_VARS='$NGINX_PROXY_READ_TIMEOUT $NGINX_PROXY_SEND_TIMEOUT'

envsubst "$NGINX_CONF_VARS" < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
envsubst "$PROXY_CONF_VARS" < /etc/nginx/proxy.conf.template > /etc/nginx/proxy.conf
envsubst "$DEFAULT_CONF_VARS" < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start Nginx using the default entrypoint
exec nginx -g 'daemon off;'
