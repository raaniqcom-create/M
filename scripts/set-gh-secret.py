"""Store a GitHub Actions secret.

GitHub requires secrets sealed with the repo's public key before upload, so the
value never travels in the clear.

    python scripts/set-gh-secret.py NAME VALUE_FILE_OR_LITERAL
"""
import base64
import io
import json
import os
import sys
import urllib.request

from nacl import encoding, public

REPO = os.environ.get('GH_REPO', 'raaniqcom-create/M')
TOKEN = os.environ['GH_TOKEN']
API = f'https://api.github.com/repos/{REPO}/actions/secrets'


def request(url, method='GET', payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', f'Bearer {TOKEN}')
    req.add_header('Accept', 'application/vnd.github+json')
    if data:
        req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        return resp.status, (json.loads(body) if body else None)


def seal(public_key_b64, secret_value):
    key = public.PublicKey(public_key_b64.encode(), encoding.Base64Encoder())
    sealed = public.SealedBox(key).encrypt(secret_value.encode())
    return base64.b64encode(sealed).decode()


def main():
    name, source = sys.argv[1], sys.argv[2]
    value = io.open(source, encoding='utf-8').read().strip() if os.path.exists(source) else source

    _, key = request(f'{API}/public-key')
    status, _ = request(
        f'{API}/{name}',
        method='PUT',
        payload={'encrypted_value': seal(key['key'], value), 'key_id': key['key_id']},
    )
    print(f'{name}: HTTP {status} ({len(value)} chars)')


if __name__ == '__main__':
    main()
