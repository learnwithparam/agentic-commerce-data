"""Decide whether to trust another agent's card: one of its signatures must verify with a key
from YOUR allowlist.

Never fetch a key from the card's own `jku` header. Whoever wrote the card chose that address,
so an impostor points it at their own key.
"""

from __future__ import annotations

import base64

from card_signing import base64url, canonical_json
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature


def from_base64url(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def public_key_from(jwk: dict) -> ec.EllipticCurvePublicKey:
    x_value = int.from_bytes(from_base64url(jwk["x"]), "big")
    y_value = int.from_bytes(from_base64url(jwk["y"]), "big")
    return ec.EllipticCurvePublicNumbers(x_value, y_value, ec.SECP256R1()).public_key()


def key_with_id(allowlist: dict, key_id: str | None) -> dict | None:
    for jwk in allowlist.get("keys", []):
        if jwk.get("kid") == key_id:
            return jwk
    return None


def signature_matches(card: dict, signature: dict, jwk: dict) -> bool:
    unsigned = {name: value for name, value in card.items() if name != "signatures"}
    payload = base64url(canonical_json(unsigned))
    signing_input = f"{signature['protected']}.{payload}".encode("ascii")
    raw_signature = from_base64url(signature["signature"])
    if len(raw_signature) != 64:
        return False
    r_value = int.from_bytes(raw_signature[:32], "big")
    s_value = int.from_bytes(raw_signature[32:], "big")
    der_signature = encode_dss_signature(r_value, s_value)
    try:
        public_key_from(jwk).verify(der_signature, signing_input, ec.ECDSA(hashes.SHA256()))
    except InvalidSignature:
        return False
    return True


def verify_card(card: dict, allowlist: dict) -> tuple[bool, str]:
    """Return (True, "") for a card signed by an allowed key, or (False, the reason).

    TODO(you):
    0. Add "import json" at the top of the file.
    1. No signatures on the card: return False and say so.
    2. For each signature, read its header: json.loads(from_base64url(signature["protected"])).
    3. Find the key with the header's "kid" in the allowlist (key_with_id). Skip it if none.
    4. If signature_matches(card, signature, key): return True.
    5. After the loop, return False with a reason.
    Never fetch the header's "jku" address.
    """
    return True, ""
