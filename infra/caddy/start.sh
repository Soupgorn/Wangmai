#!/bin/sh
set -eu
# Mode in the env file must agree with the explicitly selected Compose override.
fail() { echo 'Ingress configuration blocked; review mode and gateway security contract.' >&2; exit 1; }
[ "${WANGMAI_INGRESS_MODE:-}" = "${1:-unselected}" ] || fail
case "$1" in
  direct-https)
    [ "${WANGMAI_DIRECT_HTTPS_CONFIG:-}" = selected ] || fail
    [ -z "${WANGMAI_SHARED_GATEWAY_CONFIG:-}" ] || fail
    [ -z "${WANGMAI_SHARED_GATEWAY_HTTPS_CONFIG:-}" ] || fail
    config=/etc/caddy/Caddyfile ;;
  shared-gateway|shared-gateway-https)
    [ -z "${WANGMAI_DIRECT_HTTPS_CONFIG:-}" ] || fail
    if [ "$1" = shared-gateway ]; then
      [ "${WANGMAI_SHARED_GATEWAY_CONFIG:-}" = selected ] || fail
      [ -z "${WANGMAI_SHARED_GATEWAY_HTTPS_CONFIG:-}" ] || fail
      config=/etc/caddy/Caddyfile.shared-gateway
    else
      [ "${WANGMAI_SHARED_GATEWAY_HTTPS_CONFIG:-}" = selected ] || fail
      [ -z "${WANGMAI_SHARED_GATEWAY_CONFIG:-}" ] || fail
      [ "${WANGMAI_GATEWAY_TLS_VERIFICATION_VERIFIED:-}" = verified ] || fail
      [ -n "${WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE:-}" ] || fail
      case "$WANGMAI_GATEWAY_TLS_CONTRACT_REFERENCE" in unverified|pending|unknown|*CHANGE_ME*|*change_me*) fail ;; esac
      [ -n "${WANGMAI_ORIGIN_TLS_IDENTITY:-}" ] || fail
      case "$WANGMAI_ORIGIN_TLS_IDENTITY" in *[!a-z0-9.-]*) fail ;; esac
      case "${WANGMAI_ORIGIN_BIND_IP:-}" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*) ;; *) fail ;; esac
      printf '%s\n' "$WANGMAI_ORIGIN_BIND_IP" | awk -F '[.]' 'NF != 4 {exit 1} {for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || $i+0>255 || (length($i)>1 && substr($i,1,1)=="0")) exit 1}' || fail
      case "$WANGMAI_ORIGIN_TLS_IDENTITY" in *[a-z]*) ;; *) [ "$WANGMAI_ORIGIN_TLS_IDENTITY" = "$WANGMAI_ORIGIN_BIND_IP" ] || fail ;; esac
      for file in fullchain.pem private.key trust.pem; do
        [ -f "/run/wangmai-origin/$file" ] && [ -s "/run/wangmai-origin/$file" ] && [ -r "/run/wangmai-origin/$file" ] || fail
      done
      config=/etc/caddy/Caddyfile.shared-gateway-https
    fi
    [ "${WANGMAI_GATEWAY_HEADERS_VERIFIED:-}" = verified ] || fail
    [ "${WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED:-}" = verified ] || fail
    [ "${WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED:-}" = verified ] || fail
    [ -n "${WANGMAI_GATEWAY_CIDRS:-}" ] || fail
    [ -n "${WANGMAI_GATEWAY_CONTRACT_REFERENCE:-}" ] || fail
    case "$WANGMAI_GATEWAY_CONTRACT_REFERENCE" in unverified|pending|unknown|*CHANGE_ME*|*change_me*) fail ;; esac
    # Full canonical CIDR validation is mandatory in preflight. Reject obvious
    # blanket trust/config injection here as well, even if preflight was skipped.
    for cidr in $WANGMAI_GATEWAY_CIDRS; do
      case "$cidr" in *[!0-9a-fA-F:./]*|*/0|10.0.0.0/8|172.16.0.0/12|192.168.0.0/16|fc00::/7|fd00::/8) fail ;; esac
      case "$cidr" in */*) ;; *) fail ;; esac
    done
    ;;
  *) fail ;;
esac
# Provisioning validates PEM parsing and key pairing without starting a listener.
# Suppress Caddy's diagnostics here: bad PEM/path data must not enter routine logs.
caddy validate --config "$config" --adapter caddyfile >/dev/null 2>&1 || fail
exec caddy run --config "$config" --adapter caddyfile
