"""Compatibility helpers for feeding legacy solver payloads into SolverV2."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple

ROLE_ALIASES = {
    'REG': 'REGISTER',
    'REGISTERS': 'REGISTER',
    'PROD': 'PRODUCT',
    'PRODUCTS': 'PRODUCT',
    'PARKING_HELM': 'PARKING_HELMS',
    'P_HELM': 'PARKING_HELMS',
    'PARKING': 'PARKING_HELMS',
    'MEAL_BREAK': 'BREAK',
}

ASSIGNMENT_MODEL_MAP = {
    'UNIVERSAL': 'HOURLY',
    'CREW_SPECIFIC': 'DAILY',
    'COVERAGE_WINDOW': 'HOURLY_OR_WINDOW',
    'HOURLY': 'HOURLY',
    'HOURLY_OR_WINDOW': 'HOURLY_OR_WINDOW',
    'DAILY': 'DAILY',
    'SOLVER': 'SOLVER',
}


def normalize_payload(raw_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize legacy SolverInput payloads into SolverInputV2 shape."""
    import sys
    DEBUG = False
    
    if DEBUG: print(f"\n[NORMALIZER DEBUG] raw_payload keys: {list(raw_payload.keys())}", file=sys.stderr)
    
    payload = _extract_inner_payload(raw_payload)
    
    if DEBUG: print(f"[NORMALIZER DEBUG] after extract, payload keys: {list(payload.keys())}", file=sys.stderr)
    
    if 'store' in payload and 'roles' in payload:
        # Already conforms to SolverInputV2
        if DEBUG: print(f"[NORMALIZER DEBUG] Payload already V2 format, passing through", file=sys.stderr)
        if DEBUG: print(f"[NORMALIZER DEBUG] crew count: {len(payload.get('crew', []))}", file=sys.stderr)
        if payload.get('crew'):
            crew0 = payload['crew'][0]
            if DEBUG: print(f"[NORMALIZER DEBUG] crew[0] keys: {list(crew0.keys())}", file=sys.stderr)
            if DEBUG: print(f"[NORMALIZER DEBUG] crew[0] roleIds: {crew0.get('roleIds', 'MISSING!')}", file=sys.stderr)
        return payload

    store_metadata = payload.get('storeMetadata') or payload.get('store')
    if not store_metadata:
        raise ValueError("Solver payload missing store metadata")

    store = {
        'id': store_metadata.get('storeId')
        or payload.get('storeId')
        or payload.get('id')
        or 0,
        'timezone': payload.get('timezone')
        or store_metadata.get('timezone')
        or 'UTC',
        'baseSlotMinutes': store_metadata.get('baseSlotMinutes')
        or payload.get('baseSlotMinutes')
        or 30,
        'openMinutesFromMidnight': store_metadata.get('openMinutesFromMidnight', 0),
        'closeMinutesFromMidnight': store_metadata.get('closeMinutesFromMidnight', 24 * 60),
        'reqShiftLengthForBreak': store_metadata.get('reqShiftLengthForBreak', 0),
    }

    roles, role_id_map = _build_roles(payload)
    crew = _build_crew(payload.get('crew', []), role_id_map)
    hourly_requirements = _build_hourly_requirements(payload.get('hourlyRequirements', []), role_id_map)
    window_requirements = _build_window_requirements(payload.get('coverageWindows', []), role_id_map)
    daily_requirements = _build_daily_requirements(payload.get('crewRoleRequirements', []), role_id_map)
    normalized = {
        'store': store,
        'roles': roles,
        'crew': crew,
        'hourlyRequirements': hourly_requirements,
        'windowRequirements': window_requirements,
        'dailyRequirements': daily_requirements,
    }

    for passthrough_key in ('date', 'timeLimitSeconds', 'settings', 'fairnessTrackers', 'fairnessHistory', 'shiftHistory'):
        if passthrough_key in payload:
            normalized[passthrough_key] = payload[passthrough_key]

    return normalized


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_inner_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    # Node.js sends { solverInput, timeLimitSeconds }
    if 'solverInput' in raw and isinstance(raw['solverInput'], dict):
        return raw['solverInput']
    # Also check 'data' for backward compatibility
    if 'data' in raw and isinstance(raw['data'], dict):
        return raw['data']
    return raw


def _build_roles(payload: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    legacy_roles = payload.get('roleMetadata') or []
    roles: List[Dict[str, Any]] = []
    role_id_map: Dict[str, int] = {}
    next_role_id = 1

    for meta in legacy_roles:
        code = _extract_role_code(meta)
        if not code:
            continue
        role_id = next_role_id
        next_role_id += 1
        role_id_map[code] = role_id

        assignment_model = _normalize_assignment_model(meta.get('assignmentModel'))
        consecutive_policy = _consecutive_policy(meta)

        roles.append(
            {
                'id': role_id,
                'code': code,
                'displayName': meta.get('detail') or code.title().replace('_', ' '),
                'assignmentModels': assignment_model,
                'minSlots': meta.get('minSlots', 0),
                'maxSlots': meta.get('maxSlots', 0),
                'blockSize': meta.get('blockSize', 1),
                'allowOutsideStoreHours': bool(
                    meta.get('allowOutsideStoreHours', False) or meta.get('isBreakRole', False)
                ),
                'consecutivePolicy': consecutive_policy,
                'windowOffsets': _window_offsets(meta),
            }
        )

    additional_codes = _collect_role_codes(payload)
    for code in sorted(additional_codes):
        if code in role_id_map:
            continue
        role_id = next_role_id
        next_role_id += 1
        role_id_map[code] = role_id
        roles.append(_default_role_descriptor(code, role_id))

    return roles, role_id_map


def _extract_role_code(meta: Dict[str, Any]) -> str | None:
    code = meta.get('roleCode') or meta.get('role') or meta.get('code') or meta.get('taskType')
    if not code:
        return None
    return str(code).upper()


def _normalize_assignment_model(value: Any) -> List[str]:
    if value is None:
        return ['HOURLY']
    if isinstance(value, (list, tuple)):
        return [_map_assignment_model(v) for v in value]
    return [_map_assignment_model(value)]


def _map_assignment_model(value: Any) -> str:
    key = str(value).upper()
    return ASSIGNMENT_MODEL_MAP.get(key, 'HOURLY')


def _consecutive_policy(meta: Dict[str, Any]) -> str:
    policy = meta.get('consecutivePolicy')
    if policy:
        return str(policy).upper()
    if meta.get('slotsMustBeConsecutive') or meta.get('isConsecutive'):
        return 'REQUIRED'
    if meta.get('isBreakRole'):
        return 'REQUIRED'
    return 'NONE'


def _window_offsets(meta: Dict[str, Any]) -> Dict[str, int] | None:
    start = meta.get('windowStartOffsetMin')
    end = meta.get('windowEndOffsetMin')
    if start is None or end is None:
        return None
    return {'startOffsetMin': start, 'endOffsetMin': end}


def _default_role_descriptor(code: str, role_id: int) -> Dict[str, Any]:
    return {
        'id': role_id,
        'code': code,
        'displayName': code.title().replace('_', ' '),
        'assignmentModels': ['HOURLY'],
        'minSlots': 0,
        'maxSlots': 8,
        'blockSize': 1,
        'allowOutsideStoreHours': True,
        'consecutivePolicy': 'NONE',
    }


def _collect_role_codes(payload: Dict[str, Any]) -> Iterable[str]:
    codes = set()

    def add(code: Any) -> None:
        if not code:
            return
        codes.add(str(code).upper())

    for crew in payload.get('crew', []):
        for role in crew.get('eligibleRoles') or []:
            add(role)

    for req in payload.get('crewRoleRequirements', []):
        add(req.get('role'))

    for window in payload.get('coverageWindows', []):
        add(window.get('role'))

    for hourly in payload.get('hourlyRequirements', []):
        for label in ('REGISTER', 'PRODUCT', 'PARKING_HELM', 'P_HELM'):
            if hourly.get(_hourly_field_for_role(label)):
                add(label)
        for extra in hourly.get('additionalRequirements', []) or []:
            add(extra.get('role'))

    return codes


def _hourly_field_for_role(code: str) -> str:
    return {
        'REGISTER': 'requiredRegister',
        'PRODUCT': 'requiredProduct',
        'PARKING_HELMS': 'requiredParkingHelm',
        'PARKING_HELM': 'requiredParkingHelm',
        'P_HELM': 'requiredParkingHelm',
    }.get(code, '')


def _build_crew(crew_records: List[Dict[str, Any]], role_id_map: Dict[str, int]) -> List[Dict[str, Any]]:
    result = []
    for crew in crew_records:
        eligible_roles = crew.get('eligibleRoles') or []
        role_ids = [rid for rid in (_role_id_for_code(code, role_id_map) for code in eligible_roles) if rid is not None]
        result.append(
            {
                'id': crew.get('id'),
                'name': crew.get('name', crew.get('id')),
                'roleIds': role_ids,
                'shiftStartMin': crew.get('shiftStartMin', 0),
                'shiftEndMin': crew.get('shiftEndMin', 0),
            }
        )
    return result


def _build_hourly_requirements(requirements: List[Dict[str, Any]], role_id_map: Dict[str, int]) -> List[Dict[str, Any]]:
    result = []
    for req in requirements:
        hour = int(req.get('hour', 0))
        for code, field in (
            ('REGISTER', 'requiredRegister'),
            ('PRODUCT', 'requiredProduct'),
            ('PARKING_HELMS', 'requiredParkingHelm'),
            ('PARKING_HELM', 'requiredParkingHelm'),
        ):
            value = req.get(field, 0)
            if value:
                role_id = _role_id_for_code(code, role_id_map)
                if role_id is not None:
                    result.append({'roleId': role_id, 'hour': hour, 'required': value})

        for extra in req.get('additionalRequirements', []) or []:
            code = extra.get('role')
            value = extra.get('required')
            if not code or not value:
                continue
            role_id = _role_id_for_code(code, role_id_map)
            if role_id is not None:
                result.append({'roleId': role_id, 'hour': hour, 'required': value})
    return result


def _build_window_requirements(windows: List[Dict[str, Any]], role_id_map: Dict[str, int]) -> List[Dict[str, Any]]:
    result = []
    for window in windows:
        role_id = _role_id_for_code(window.get('role'), role_id_map)
        if role_id is None:
            continue
        result.append(
            {
                'roleId': role_id,
                'startHour': int(window.get('startHour', 0)),
                'endHour': int(window.get('endHour', 0)),
                'requiredPerHour': window.get('requiredPerHour', 0),
            }
        )
    return result


def _build_daily_requirements(requirements: List[Dict[str, Any]], role_id_map: Dict[str, int]) -> List[Dict[str, Any]]:
    result = []
    for req in requirements:
        role_id = _role_id_for_code(req.get('role'), role_id_map)
        if role_id is None:
            continue
        required_minutes = int(round(float(req.get('requiredHours', 0) or 0) * 60))
        result.append(
            {
                'crewId': req.get('crewId'),
                'roleId': role_id,
                'requiredMinutes': required_minutes,
            }
        )
    return result


def _role_id_for_code(code: Any, role_id_map: Dict[str, int]) -> int | None:
    if code is None:
        return None
    normalized = str(code).upper()
    if normalized in role_id_map:
        return role_id_map[normalized]
    alias = ROLE_ALIASES.get(normalized)
    if alias and alias in role_id_map:
        return role_id_map[alias]
    return None


__all__ = ["normalize_payload"]
