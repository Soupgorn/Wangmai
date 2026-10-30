#!/bin/sh
set -eu
# Mode in the env file must agree with the explicitly selected Compose override.
fail() { echo 'Ingress configuration blocked; review mode and gateway security contract.' >&2; exit 1; }
[ "${WANGMAI_INGRESS_MODE:-}" = "${1:-unselected}" ] || fail
case "$1" in
  direct-https)
    [ "${WANGMAI_DIRECT_HTTPS_CONFIG:-}" = selected ] || fail
    [ -z "${WANGMAI_SHARED_GATEWAY_CONFIG:-}" ] || fail
    config=/etc/caddy/Caddyfile ;;
  shared-gateway)
    [ "${WANGMAI_SHARED_GATEWAY_CONFIG:-}" = selected ] || fail
    [ -z "${WANGMAI_DIRECT_HTTPS_CONFIG:-}" ] || fail
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
    config=/etc/caddy/Caddyfile.shared-gateway ;;
  *) fail ;;
esac
exec caddy run --config "$config" --adapter caddyfile
