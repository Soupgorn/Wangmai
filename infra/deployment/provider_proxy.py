"""Additional provider -> Next ingress guards; shared DB/release guards stay in ops."""
import ipaddress

PROTECTIONS = ("ipsec", "wireguard", "macsec", "provider-encrypted-private-network")
VERIFICATIONS = ("WANGMAI_GATEWAY_HEADERS_VERIFIED", "WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED",
                 "WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED", "WANGMAI_ORIGIN_INTEGRITY_VERIFIED")


def validate_ingress(config):
    errors = []
    services = config["services"]
    frontend = services["frontend"]
    env = frontend["environment"]
    def require(ok, message):
        if not ok:
            errors.append(message)
    require(set(services) <= {"frontend", "backend", "postgres", "bootstrap", "migrator"},
            "Provider mode permits only three steady-state services and explicit database-ops tools; Caddy is historical only.")
    for name in ("bootstrap", "migrator"):
        if name in services:
            require(services[name].get("profiles") == ["database-ops"], "Database tools require the explicit database-ops profile.")
    require(env.get("WANGMAI_PROVIDER_PROXY_NEXT_CONFIG") == "selected", "Select the explicit provider-proxy-next override.")
    require(not any(key.endswith("_CONFIG") and key != "WANGMAI_PROVIDER_PROXY_NEXT_CONFIG" for key in env),
            "Historical ingress selectors cannot be combined with provider mode.")
    require(env.get("NODE_ENV") == "production" and str(env.get("PORT")) == "3000", "Next must run in production on port 3000.")
    # Override commands/entrypoints can silently skip the image's socket/startup guard.
    require(not frontend.get("command") and not frontend.get("entrypoint") and not frontend.get("volumes"),
            "Frontend must use the immutable image entrypoint and ingress guard without mounts or command overrides.")
    require(services["backend"]["environment"].get("AUTH_CLIENT_IP_HEADER") == "x-wangmai-client-ip",
            "Better Auth must use only the client IP sanitized by the socket guard.")
    ports = frontend.get("ports", [])
    require(len(ports) == 1 and str(ports[0].get("published")) == "3000" and ports[0].get("target") == 3000
            and ports[0].get("protocol", "tcp") == "tcp" and ports[0].get("host_ip") == env.get("WANGMAI_ORIGIN_BIND_IP"),
            "Only Next may publish private-bind-IP:3000:3000/tcp.")
    try:
        bind = ipaddress.ip_address(env.get("WANGMAI_ORIGIN_BIND_IP", ""))
        require(isinstance(bind, ipaddress.IPv4Address) and any(bind in ipaddress.ip_network(cidr) for cidr in
                ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")), "Origin bind IP must be an explicit RFC1918 IPv4 interface.")
    except ValueError:
        errors.append("Origin bind IP must be an explicit RFC1918 IPv4 interface.")
    raw = env.get("WANGMAI_GATEWAY_CIDRS", "")
    try:
        cidrs = raw.split(" ")
        networks = [ipaddress.ip_network(cidr, strict=True) for cidr in cidrs]
        require(bool(networks) and all("/" in cidr for cidr in cidrs) and not any(c in raw for c in "\r\n\t")
                and all(isinstance(net, ipaddress.IPv4Network) and 16 <= net.prefixlen <= 32 and not net.is_loopback
                        and str(net) != "192.168.0.0/16" and not net.is_multicast and 0 < int(str(net.network_address).split(".")[0]) < 224 for net in networks),
                "Gateway CIDRs must be narrow canonical verified IPv4 TCP peer ranges (/16 through /32); no blanket trust.")
    except ValueError:
        errors.append("Gateway CIDRs must be explicit canonical TCP peer CIDRs.")
    for field in VERIFICATIONS:
        require(env.get(field) == "verified", f"{field} must be verified against operator evidence; activation is BLOCKED.")
    require(env.get("WANGMAI_ORIGIN_LINK_PROTECTION") in PROTECTIONS,
            "HTTP origin requires verified encryption and integrity (IPsec, WireGuard, MACsec or provider encrypted private network). Private IP alone is insufficient.")
    reference = env.get("WANGMAI_GATEWAY_CONTRACT_REFERENCE", "")
    require(bool(reference) and reference.strip() == reference and not any(word in reference.lower() for word in
            ("unverified", "pending", "unknown", "change_me", "replace-with", "example", "fixture", "smoke")),
            "A reviewed gateway/source/transport security evidence reference is required.")
    return errors
