"""Configuration loader + composition tests. No database."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config_loader import build_master_flow, load_config
from app.config_loader.composer import project_chain
from app.errors import ConfigError


def test_loads_all_journeys():
    cfg = load_config()
    assert cfg.version == "1.0.0"
    assert set(cfg.journeys) == {
        "employer", "corporate", "university", "community", "candidate", "join", "something-else"
    }


def test_extends_and_add_fields_resolved():
    cfg = load_config()
    contact = cfg.journeys["employer"].questions["emp_contact"]
    field_names = [f["name"] for f in contact["config"]["fields"]]
    # base fields + addFields (organisationName, previousRelationship)
    assert "email" in field_names and "consent" in field_names
    assert "organisationName" in field_names
    assert "previousRelationship" in field_names
    assert contact["config"]["submitLabel"] == "Send my hiring enquiry"


def test_uses_pulls_shared_question():
    cfg = load_config()
    assert cfg.get_question("employer", "sh_decision_maker") is not None


def test_navigator_branches_valid():
    cfg = load_config()
    branches = cfg.navigator["branches"]
    for value, branch in branches.items():
        jc = cfg.journeys[branch["journey"]]
        assert jc.node(branch["entry"]) is not None


def test_master_flow_stitched():
    cfg = load_config()
    flow, questions = build_master_flow(cfg)
    assert flow["entry"] == "sh_name"
    assert "sh_navigator" in flow["nodes"]
    # navigator branches to each journey entry
    targets = {t["to"] for t in flow["nodes"]["sh_navigator"]["transitions"]}
    assert "emp_role" in targets and "cand_desc" in targets
    assert "sh_name" in questions and "emp_role" in questions


def test_project_chain_counts_questions():
    cfg = load_config()
    jc = cfg.journeys["candidate"]
    _, qids = project_chain(jc.flow)
    assert qids == ["cand_desc", "cand_looking", "cand_profile", "cand_contact"]


def test_fail_fast_on_missing_manifest(tmp_path: Path):
    with pytest.raises(ConfigError):
        load_config(tmp_path)


def test_fail_fast_on_dangling_transition(tmp_path: Path):
    # Minimal broken config: a journey node points to a non-existent node.
    (tmp_path / "_shared").mkdir()
    (tmp_path / "_shared" / "intro.json").write_text("{}")
    (tmp_path / "_shared" / "questions.shared.json").write_text(
        json.dumps({
            "questions": {
                "sh_name": {"id": "sh_name", "type": "text", "prompt": "?"},
                "sh_navigator": {"id": "sh_navigator", "type": "single_choice", "prompt": "?", "options": []},
                "sh_contact": {"id": "sh_contact", "type": "group", "prompt": "?", "config": {"fields": []}},
            },
            "sharedFieldSets": {},
        })
    )
    (tmp_path / "manifest.json").write_text(
        json.dumps({
            "version": "9",
            "navigator": {"branches": {}},
            "journeys": [{"key": "x", "dir": "x"}],
        })
    )
    xdir = tmp_path / "x"
    xdir.mkdir()
    (xdir / "journey.json").write_text(json.dumps({"key": "x", "version": "1"}))
    (xdir / "questions.json").write_text(
        json.dumps({
            "flow": {
                "id": "x", "version": 1, "entry": "n1",
                "nodes": {"n1": {"id": "n1", "kind": "question", "questionId": "sh_name",
                                 "transitions": [{"to": "does_not_exist"}]}},
            },
            "questions": {},
        })
    )
    for name in ("timeline", "crm", "confirmation", "emails"):
        (xdir / f"{name}.json").write_text("{}")

    with pytest.raises(ConfigError):
        load_config(tmp_path)
