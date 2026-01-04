"""Lightweight self-tests for Module 4: Optimizer (annealing + locking).

Run with:
    python3 -m tuning_engine.self_test_optimizer
"""

from __future__ import annotations

import random
from tuning_engine.optimizer import (
    AnnealingConfig,
    LockDetectorConfig,
    LockReason,
    should_accept_worse_move,
    detect_unsatisfiable_rules,
    apply_weight_updates_with_locks,
)


def test_annealing_always_accepts_better() -> None:
    """Positive delta (improvement) should always be accepted."""
    for _ in range(20):
        assert should_accept_worse_move(delta_score=0.5, temperature=1.0) is True
        assert should_accept_worse_move(delta_score=0.01, temperature=0.1) is True


def test_annealing_rejects_worse_at_zero_temp() -> None:
    """At temperature=0, worse moves should always be rejected."""
    assert should_accept_worse_move(delta_score=-0.5, temperature=0.0) is False
    assert should_accept_worse_move(delta_score=-1.0, temperature=0.0) is False


def test_annealing_probabilistic_at_high_temp() -> None:
    """At high temperature, even bad moves should sometimes be accepted."""
    rng = random.Random(42)
    accepts = sum(
        1 for _ in range(100)
        if should_accept_worse_move(delta_score=-0.3, temperature=2.0, rng=rng)
    )
    # At T=2, exp(-0.3/2) ≈ 0.86, so we expect ~86/100 accepts
    assert accepts > 50, f"Expected most accepts at high temp, got {accepts}"


def test_lock_detection_triggers_on_always_unsatisfied() -> None:
    """A rule that's always eligible and always unsatisfied should be locked."""
    rules = [
        {"id": 1, "type": "TIMING", "crewId": "c1", "roleCode": "REG"},
        {"id": 2, "type": "MAX_CONSECUTIVE_MINUTES", "crewId": "c2", "roleCode": "PROD"},
    ]
    # 5 iterations: rule 0 always satisfied (1), rule 1 always unsatisfied (0)
    history = [
        [1, 0],
        [1, 0],
        [1, 0],
        [1, 0],
        [1, 0],
    ]
    weights = {1: 1.0, 2: 2.0}  # Rule 2 weight grew
    initial_weights = {1: 1.0, 2: 1.0}
    config = LockDetectorConfig(
        window_size=5,
        min_eligible_ratio=0.8,
        require_zero_satisfied=True,
        min_weight_growth=1.3,
    )
    
    locked = detect_unsatisfiable_rules(
        satisfaction_history=history,
        rules=rules,
        weights=weights,
        initial_weights=initial_weights,
        config=config,
        already_locked=set(),
        current_iteration=5,
    )
    
    assert len(locked) == 1
    assert locked[0].rule_id == 2
    assert locked[0].reason == LockReason.ALWAYS_UNSATISFIED


def test_lock_detection_skips_satisfied_rules() -> None:
    """A rule that was satisfied at least once should not be locked."""
    rules = [{"id": 1, "type": "TIMING", "crewId": "c1", "roleCode": "REG"}]
    # 5 iterations: satisfied once at iteration 2
    history = [[0], [0], [1], [0], [0]]
    weights = {1: 2.0}
    initial_weights = {1: 1.0}
    config = LockDetectorConfig(window_size=5, min_weight_growth=1.3)
    
    locked = detect_unsatisfiable_rules(
        satisfaction_history=history,
        rules=rules,
        weights=weights,
        initial_weights=initial_weights,
        config=config,
        already_locked=set(),
        current_iteration=5,
    )
    
    assert len(locked) == 0


def test_weight_ceiling_triggers_lock() -> None:
    """A rule hitting the weight ceiling should be locked immediately."""
    rules = [{"id": 1, "type": "TIMING", "crewId": "c1", "roleCode": "REG"}]
    history = [[0], [0], [0], [0], [0]]
    weights = {1: 15.0}  # Above default ceiling of 10.0
    initial_weights = {1: 1.0}
    config = LockDetectorConfig(weight_ceiling=10.0)
    
    locked = detect_unsatisfiable_rules(
        satisfaction_history=history,
        rules=rules,
        weights=weights,
        initial_weights=initial_weights,
        config=config,
        already_locked=set(),
        current_iteration=5,
    )
    
    assert len(locked) == 1
    assert locked[0].reason == LockReason.WEIGHT_CEILING_HIT


def test_apply_weight_updates_freezes_locked() -> None:
    """Locked rules should keep their current weight, not the proposed one."""
    proposed_weights = {1: 5.0, 2: 3.0}
    proposed_velocities = {1: 0.5, 2: 0.3}
    current_weights = {1: 2.0, 2: 1.5}
    current_velocities = {1: 0.1, 2: 0.1}
    locked_ids = {1}  # Lock rule 1
    
    final_w, final_v = apply_weight_updates_with_locks(
        proposed_weights=proposed_weights,
        proposed_velocities=proposed_velocities,
        locked_rule_ids=locked_ids,
        current_weights=current_weights,
        current_velocities=current_velocities,
    )
    
    # Rule 1 should be frozen at current weight
    assert final_w[1] == 2.0
    assert final_v[1] == 0.0
    # Rule 2 should get the proposed update
    assert final_w[2] == 3.0
    assert final_v[2] == 0.3


def main() -> None:
    test_annealing_always_accepts_better()
    test_annealing_rejects_worse_at_zero_temp()
    test_annealing_probabilistic_at_high_temp()
    test_lock_detection_triggers_on_always_unsatisfied()
    test_lock_detection_skips_satisfied_rules()
    test_weight_ceiling_triggers_lock()
    test_apply_weight_updates_freezes_locked()
    print("OK: self_test_optimizer")


if __name__ == "__main__":
    main()
