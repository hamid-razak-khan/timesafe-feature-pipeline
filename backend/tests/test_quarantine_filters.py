"""Tests for Quarantine Store Advanced Filtering, Search, Pagination, and Export."""
import csv
import io
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from database.db import get_engine, init_db


@pytest.fixture(scope="module")
def client():
    init_db(get_engine())
    with TestClient(app) as c:
        yield c


def test_quarantine_filter_options_api(client):
    """Verify dynamic filter choices retrieved from the operational database."""
    res = client.get("/api/rejects/filter-options")
    assert res.status_code == 200
    data = res.json()

    assert "source_files" in data
    assert "rejection_reasons" in data
    assert "resolution_statuses" in data
    assert "pipeline_runs" in data
    assert "total_stored" in data
    assert "total_unresolved" in data

    # Check source files structure
    assert isinstance(data["source_files"], list)
    if data["source_files"]:
        f = data["source_files"][0]
        assert "name" in f
        assert "count" in f

    # Check rejection reasons structure
    assert isinstance(data["rejection_reasons"], list)
    if data["rejection_reasons"]:
        r = data["rejection_reasons"][0]
        assert "code" in r
        assert "title" in r
        assert "category" in r
        assert "count" in r

    # Check resolution statuses structure
    statuses = [s["status"] for s in data["resolution_statuses"]]
    assert "unresolved" in statuses


def test_quarantine_filter_by_source_file(client):
    """Verify filtering quarantined records by original source file name."""
    opts_res = client.get("/api/rejects/filter-options")
    files = opts_res.json().get("source_files", [])
    if not files:
        pytest.skip("No source files found in DB")

    target_file = files[0]["name"]
    expected_count = files[0]["count"]

    res = client.get(f"/api/rejects?page=1&page_size=25&source_file={target_file}")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] == expected_count
    for rec in data["records"]:
        assert rec["source_file"] == target_file
        assert "source_row_number" in rec
        assert "reject_id" in rec


def test_quarantine_filter_by_rejection_reason(client):
    """Verify filtering quarantined records by rejection reason code/category."""
    opts_res = client.get("/api/rejects/filter-options")
    reasons = opts_res.json().get("rejection_reasons", [])
    if not reasons:
        pytest.skip("No rejection reasons found in DB")

    target_reason = reasons[0]["code"]

    res = client.get(f"/api/rejects?page=1&page_size=25&rejection_reason={target_reason}")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] > 0
    for rec in data["records"]:
        assert target_reason.lower() in rec["rejection_reason"].lower()


def test_quarantine_filter_by_resolution_status(client):
    """Verify filtering quarantined records by resolution status (unresolved, reprocessed)."""
    res_unres = client.get("/api/rejects?page=1&page_size=25&status=unresolved")
    assert res_unres.status_code == 200
    data_unres = res_unres.json()

    for rec in data_unres["records"]:
        assert rec["resolution_status"] in ("unresolved", None)

    res_repr = client.get("/api/rejects?page=1&page_size=25&status=reprocessed")
    assert res_repr.status_code == 200
    data_repr = res_repr.json()

    for rec in data_repr["records"]:
        assert rec["resolution_status"] == "reprocessed"


def test_quarantine_filter_by_run_id(client):
    """Verify filtering quarantined records by pipeline run ID."""
    opts_res = client.get("/api/rejects/filter-options")
    runs = opts_res.json().get("pipeline_runs", [])
    if not runs:
        pytest.skip("No runs found in DB")

    target_run = runs[0]["run_id"]
    expected_count = runs[0]["count"]

    res = client.get(f"/api/rejects?page=1&page_size=25&run_id={target_run}")
    assert res.status_code == 200
    data = res.json()

    assert data["total"] == expected_count
    for rec in data["records"]:
        assert rec["run_id"] == target_run


def test_quarantine_filter_by_date_range(client):
    """Verify filtering quarantined records by UTC date boundaries."""
    # Query today's records
    res = client.get("/api/rejects?page=1&page_size=25&start_date=2026-11-01&end_date=2026-11-30")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 0

    # Query out-of-range date
    res_empty = client.get("/api/rejects?page=1&page_size=25&start_date=2020-01-01&end_date=2020-01-02")
    assert res_empty.status_code == 200
    data_empty = res_empty.json()
    assert data_empty["total"] == 0
    assert len(data_empty["records"]) == 0


def test_quarantine_search_capabilities(client):
    """Verify safe parameterized search across Reject ID, Entity ID, and error message."""
    # 1. Search by Reject ID prefix
    res = client.get("/api/rejects?page=1&page_size=10&search=REJ_")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    assert "REJ_" in data["records"][0]["reject_id"]

    # 2. Search by specific entity/customer ID
    res_entity = client.get("/api/rejects?page=1&page_size=10&search=CUST_")
    assert res_entity.status_code == 200
    data_entity = res_entity.json()
    assert data_entity["total"] > 0

    # 3. Search non-existent string
    res_none = client.get("/api/rejects?page=1&page_size=10&search=NON_EXISTENT_STRING_99999")
    assert res_none.status_code == 200
    assert res_none.json()["total"] == 0


def test_quarantine_combined_and_filters(client):
    """Verify that multiple active filters combine strictly with AND logic."""
    opts_res = client.get("/api/rejects/filter-options")
    files = opts_res.json().get("source_files", [])
    if not files:
        pytest.skip("No source files found in DB")

    target_file = files[0]["name"]
    res = client.get(
        f"/api/rejects?page=1&page_size=10&source_file={target_file}&status=unresolved"
    )
    assert res.status_code == 200
    data = res.json()

    for rec in data["records"]:
        assert rec["source_file"] == target_file
        assert rec["resolution_status"] in ("unresolved", None)


def test_quarantine_sorting(client):
    """Verify newest-first and oldest-first stable sorting."""
    res_newest = client.get("/api/rejects?page=1&page_size=10&sort=newest")
    res_oldest = client.get("/api/rejects?page=1&page_size=10&sort=oldest")

    assert res_newest.status_code == 200
    assert res_oldest.status_code == 200

    newest_recs = res_newest.json()["records"]
    oldest_recs = res_oldest.json()["records"]

    if len(newest_recs) > 1 and len(oldest_recs) > 1:
        # Compare first item of newest with first item of oldest
        assert newest_recs[0]["rejected_at"] >= oldest_recs[0]["rejected_at"]


def test_quarantine_pagination(client):
    """Verify server-side pagination with page size, total pages, and distinct offsets."""
    res_p1 = client.get("/api/rejects?page=1&page_size=5")
    res_p2 = client.get("/api/rejects?page=2&page_size=5")

    assert res_p1.status_code == 200
    assert res_p2.status_code == 200

    p1_data = res_p1.json()
    p2_data = res_p2.json()

    assert p1_data["page"] == 1
    assert p1_data["page_size"] == 5
    assert p2_data["page"] == 2
    assert p2_data["page_size"] == 5

    if p1_data["total"] >= 10:
        p1_ids = [r["reject_id"] for r in p1_data["records"]]
        p2_ids = [r["reject_id"] for r in p2_data["records"]]
        assert len(set(p1_ids).intersection(set(p2_ids))) == 0


def test_quarantine_export_filtered_csv(client):
    """Verify that export downloads all matching records with required headers."""
    res = client.get("/api/rejects/export?source_file=transactions.csv&status=unresolved")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=timesafe_quarantine_export.csv" in res.headers.get("content-disposition", "")

    reader = csv.reader(io.StringIO(res.text))
    headers = next(reader)

    assert "reject_id" in headers
    assert "source_file" in headers
    assert "source_row_number" in headers
    assert "rejection_reason" in headers
    assert "resolution_status" in headers
    assert "raw_record" in headers

    row_count = sum(1 for _ in reader)
    assert row_count > 0


def test_quarantine_lifecycle_detail_by_reject_id(client):
    """Verify that clicking a reject ID accesses complete audit lifecycle detail."""
    res_list = client.get("/api/rejects?page=1&page_size=1")
    assert res_list.status_code == 200
    records = res_list.json()["records"]
    if not records:
        pytest.skip("No reject records in DB")

    sample_reject_id = records[0]["reject_id"]
    res_detail = client.get(f"/api/history/records/{sample_reject_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()

    assert "record" in detail
    assert "corrections" in detail
    assert "events" in detail

