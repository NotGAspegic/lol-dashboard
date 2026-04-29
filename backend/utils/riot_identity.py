from __future__ import annotations

import re


PRETTY_REGION_TO_PLATFORM = {
    "br": "br1",
    "eune": "eun1",
    "euw": "euw1",
    "jp": "jp1",
    "kr": "kr",
    "lan": "la1",
    "las": "la2",
    "me": "me1",
    "na": "na1",
    "oce": "oc1",
    "ph": "ph2",
    "ru": "ru",
    "sg": "sg2",
    "th": "th2",
    "tr": "tr1",
    "tw": "tw2",
    "vn": "vn2",
}

PLATFORM_TO_PRETTY_REGION = {value: key for key, value in PRETTY_REGION_TO_PLATFORM.items()}


def slugify_riot_id_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned or "player"


def build_riot_id_slug(game_name: str, tag_line: str) -> str:
    return f"{slugify_riot_id_part(game_name)}-{slugify_riot_id_part(tag_line)}".lower()


def normalize_region_for_lookup(region: str) -> str:
    normalized = region.strip().lower()
    return PRETTY_REGION_TO_PLATFORM.get(normalized, normalized)


def format_region_slug(region: str) -> str:
    normalized = region.strip().lower()
    return PLATFORM_TO_PRETTY_REGION.get(normalized, normalized)
