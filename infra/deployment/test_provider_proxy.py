import copy
import unittest
from test_ops import ops, valid_config


def provider_config():
    config = valid_config()
    del config['services']['caddy']
    frontend = config['services']['frontend']
    frontend['ports'] = [{'host_ip': '10.60.2.22', 'published': '3000', 'target': 3000}]
    frontend['environment'].update({
        'NODE_ENV': 'production', 'PORT': '3000', 'WANGMAI_INGRESS_MODE': 'provider-proxy-next',
        'WANGMAI_PROVIDER_PROXY_NEXT_CONFIG': 'selected', 'WANGMAI_DOMAIN': 'wangmai.snowballwy.com',
        'WANGMAI_ORIGIN_BIND_IP': '10.60.2.22', 'WANGMAI_GATEWAY_CIDRS': '192.0.2.10/32',
        'WANGMAI_GATEWAY_HEADERS_VERIFIED': 'verified', 'WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED': 'verified',
        'WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED': 'verified', 'WANGMAI_ORIGIN_INTEGRITY_VERIFIED': 'verified',
        'WANGMAI_ORIGIN_LINK_PROTECTION': 'ipsec', 'WANGMAI_GATEWAY_CONTRACT_REFERENCE': 'review/GW-123',
    })
    config['services']['backend']['environment']['BETTER_AUTH_URL'] = 'https://wangmai.snowballwy.com'
    config['services']['backend']['environment']['AUTH_CLIENT_IP_HEADER'] = 'x-wangmai-client-ip'
    return config


class ProviderGuards(unittest.TestCase):
    def test_verified_configuration(self):
        self.assertEqual(ops.validate(provider_config()), [])

    def test_previous_auth_origins_cannot_mismatch_the_new_gateway_host(self):
        for domain in ('wangmai.public.cloud.ce-nacl.com', 'wangmai.ce-nacl.com'):
            config = provider_config()
            config['services']['backend']['environment']['BETTER_AUTH_URL'] = f'https://{domain}'
            self.assertTrue(any('BETTER_AUTH_URL' in error for error in ops.validate(config)))

    def test_unverified_security_is_never_automatically_accepted(self):
        for key in ('WANGMAI_GATEWAY_HEADERS_VERIFIED', 'WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED',
                    'WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED', 'WANGMAI_ORIGIN_INTEGRITY_VERIFIED',
                    'WANGMAI_ORIGIN_LINK_PROTECTION', 'WANGMAI_GATEWAY_CONTRACT_REFERENCE', 'WANGMAI_GATEWAY_CIDRS'):
            for value in ('', 'unverified', 'CHANGE_ME'):
                config = provider_config()
                config['services']['frontend']['environment'][key] = value
                self.assertTrue(ops.validate(config), key)

    def test_gateway_networks_fail_closed(self):
        for cidr in ('0.0.0.0/0', '10.0.0.0/8', '192.168.0.0/16', '172.16.0.0/12', '127.0.0.1/32',
                     '192.0.2.1/24', '192.0.2.10', '::/0', '192.0.2.10/32\n', '240.0.0.1/32'):
            config = provider_config()
            config['services']['frontend']['environment']['WANGMAI_GATEWAY_CIDRS'] = cidr
            self.assertTrue(ops.validate(config), cidr)

    def test_ports_bypasses_and_extra_services_fail(self):
        for name in ('backend', 'postgres'):
            config = provider_config()
            config['services'][name]['ports'] = [{'published': '4000', 'target': 4000}]
            self.assertTrue(ops.validate(config))
        for field, value in [('command', ['node', 'frontend/server.js']), ('entrypoint', ['sh']), ('network_mode', 'host'), ('volumes', ['.:/app'])]:
            config = provider_config()
            config['services']['frontend'][field] = value
            self.assertTrue(ops.validate(config), field)
        for bind in ('0.0.0.0', '127.0.0.1', '203.0.113.10'):
            config = provider_config()
            config['services']['frontend']['ports'][0]['host_ip'] = bind
            config['services']['frontend']['environment']['WANGMAI_ORIGIN_BIND_IP'] = bind
            self.assertTrue(ops.validate(config))
        config = provider_config()
        config['services']['caddy'] = copy.deepcopy(valid_config()['services']['caddy'])
        self.assertTrue(ops.validate(config))
