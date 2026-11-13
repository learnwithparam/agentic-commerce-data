"""Sign your Agent Card, the way A2A 1.0 says: a JWS with ES256 over the card's canonical JSON.

Signing input = base64url(protected header) + "." + base64url(canonical JSON of the card)
"""

from __future__ import annotations

import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def repo_root() -> Path:
    """The first folder above this file that holds pyproject.toml."""
    for folder in Path(__file__).resolve().parents:
        if (folder / "pyproject.toml").exists():
            return folder
    return Path.cwd()


# The private key never goes into git: data/ is ignored. A check passes its own path.
DEFAULT_KEY_FILE = repo_root() / "data" / "keys" / "ops-desk-key.pem"
KEY_FILE = Path(os.environ.get("OPS_KEY_FILE", DEFAULT_KEY_FILE))


def base64url(data: bytes) -> str:
    """Base64url without the = padding, as JWS writes it."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def canonical_json(value: object) -> bytes:
    """RFC 8785 canonical JSON: keys sorted, no spaces, UTF-8. Every signer gets the same bytes.

    TODO(you): sort the keys and drop every space. This version does neither.
    """
    return json.dumps(value).encode("utf-8")


def signed_card(card: dict, private_key: ec.EllipticCurvePrivateKey, key_id: str) -> dict:
    """Return the card with one signature over everything except the signatures field.

    TODO(you):
    0. Add two imports at the top of the file:
       from cryptography.hazmat.primitives import hashes, serialization
       from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    1. Copy the card without its "signatures" field.
    2. protected = base64url(canonical_json({"alg": "ES256", "typ": "JOSE", "kid": key_id}))
    3. payload = base64url(canonical_json(the card copy))
    4. Sign f"{protected}.{payload}" with private_key.sign(..., ec.ECDSA(hashes.SHA256())).
    5. That gives a DER signature. Turn it into r and s with decode_dss_signature, and join
       r and s as two 32-byte numbers. base64url that: it is the "signature".
    6. Return the card copy with "signatures": [{"protected": ..., "signature": ...}].
    """
    return dict(card)


def public_jwk(private_key: ec.EllipticCurvePrivateKey, key_id: str) -> dict:
    """The public half of the key as a JSON Web Key, for /.well-known/jwks.json."""
    numbers = private_key.public_key().public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "x": base64url(numbers.x.to_bytes(32, "big")),
        "y": base64url(numbers.y.to_bytes(32, "big")),
        "kid": key_id,
        "alg": "ES256",
        "use": "sig",
    }


def load_or_create_key(path: Path = KEY_FILE) -> ec.EllipticCurvePrivateKey:
    """Read the private key, or make a new P-256 key the first time."""
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    private_key = ec.generate_private_key(ec.SECP256R1())
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pem)
    return private_key
