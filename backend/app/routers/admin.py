from __future__ import annotations

import logging
import sys
from datetime import datetime
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.quota_template import parse_t1_workbook
from app.schemas import AdminUserCreate, AdminUserList, AdminUserUpdate, UploadResult, UserOut, user_out
from app.security import require_admin
from app.seed import seed_users
from app.repositories import roster_repo
from app.services.roster_service import RosterServiceError
from app.services.sync_schedule_service import SyncScheduleError
from app.services.user_service import UserServiceError
from app.services.vtiger_sync_service import VtigerSyncError
from app.services import roster_service, sync_schedule_service, user_service, vtiger_sync_service

router = APIRouter()
_log = logging.getLogger("galaxy.admin")


def _user_error(request: Request, actor: User, exc: UserServiceError) -> HTTPException:
    _log.warning(
        "user_admin_failed ts=%s user_id=%s method=%s path=%s detail=%s",
        datetime.utcnow().isoformat(),
        actor.id,
        request.method,
        request.url.path,
        exc.message,
    )
    return HTTPException(status_code=exc.status_code, detail=exc.message)

def _scripts_path() -> str:
    scripts = str(settings.root / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    return scripts


_assignment_history = roster_service.assignment_history

IC_QUOTAS_PATH = roster_repo.IC_QUOTAS_PATH
QUOTA_RULES_PATH = roster_repo.QUOTA_RULES_PATH
RTM_DIVISIONS = ["S1", "S2", "CB", "GB", "South", "DataCentre", "GeoX"]


class AssignmentRow(BaseModel):
    division: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class IcQuotaPerson(BaseModel):
    name: str = Field(min_length=1)
    division: str = ""
    type: str = "IC"
    reporting_manager: Optional[str] = None
    q1_quota: Optional[float] = 0
    q2_quota: Optional[float] = 0
    q3_quota: Optional[float] = 0
    q4_quota: Optional[float] = 0
    h1_quota: Optional[float] = None
    h2_quota: Optional[float] = 0
    annual_quota: Optional[float] = None
    assignments: Optional[list[AssignmentRow]] = None
    transfer_start: Optional[str] = None
    rtm_correction: bool = False


class QuotaAccountOp(BaseModel):
    # Piggyback login CRUD on PUT /quotas — Chrome blocks /directory, /logins, /users.
    op: str
    id: Optional[int] = None
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    employee_name: Optional[str] = None
    is_active: Optional[bool] = None


class HistoryOp(BaseModel):
    # Full replacement of one person's RTM history, past rows included.
    name: str = Field(min_length=1, max_length=200)
    assignments: list[AssignmentRow] = Field(max_length=50)


class SyncScheduleBody(BaseModel):
    enabled: bool = False
    interval_unit: str = "days"
    interval_value: int = 1


class QuotaSaveRequest(BaseModel):
    people: Optional[list[IcQuotaPerson]] = None
    bu_annual_quotas: Optional[dict[str, dict[str, float]]] = None
    account: Optional[QuotaAccountOp] = None
    history: Optional[HistoryOp] = None
    sync: Optional[bool] = None
    sync_cancel: Optional[bool] = None
    sync_schedule: Optional[SyncScheduleBody] = None


_atomic_write_json = roster_repo.write_json_atomic
_load_json = roster_repo.read_json
_run_parse = roster_service.rebuild_dashboard


def _reject_if_syncing() -> None:
    if roster_service.is_syncing():
        raise HTTPException(status_code=409, detail="A Vtiger sync is running. Wait until it finishes.")


def _deal_counts() -> dict[str, int]:
    _scripts_path()
    import deal_store  # type: ignore
    return deal_store.counts_by_quarter()


def _sync_status_payload(job_id: Optional[str] = None) -> dict[str, Any]:
    _scripts_path()
    import deal_store  # type: ignore

    try:
        deals = _deal_counts()
    except Exception:
        _log.exception("vtiger_sync_deal_counts_failed")
        deals = None

    job = deal_store.get_job(job_id) if job_id else deal_store.get_latest_job()
    payload: dict[str, Any] = {
        "configured": vtiger_sync_service.vtiger_configured(),
        "deals": deals,
        "job_id": None,
        "status": None,
        "running": False,
        "last_run": None,
        "last_result": None,
        "last_error": None,
        "quarters": [],
    }
    if job:
        payload.update(job)
    try:
        payload["schedule"] = sync_schedule_service.get_schedule()
    except Exception:
        _log.exception("sync_schedule_payload_failed")
        payload["schedule"] = None
    return payload


def _start_vtiger_sync(quarter: str = "all") -> dict[str, Any]:
    try:
        return vtiger_sync_service.start_vtiger_sync(quarter)
    except VtigerSyncError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None


@router.get("/status")
@router.get("/uploads/status")
def admin_status(user: Annotated[User, Depends(require_admin)]):
    ic = {k: v for k, v in _load_json(IC_QUOTAS_PATH).items() if not str(k).startswith("_")}
    rtm = sum(1 for v in ic.values() if isinstance(v, dict) and v.get("division") in RTM_DIVISIONS)
    try:
        deals = _deal_counts()
    except Exception:
        _log.exception("admin_status_deal_counts_failed")
        deals = {"q1": 0, "q2": 0, "q3": 0, "q4": 0, "total": 0}
    payload = _sync_status_payload()
    payload.update({
        "deals": deals,
        "quota_count": len(ic),
        "rtm_count": rtm,
        "quota_json": {
            "exists": settings.quota_json.exists(),
        },
        "source": "sqlite+config",
    })
    return payload


@router.get("/quotas")
def get_quotas(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    ap: Optional[int] = Query(None, ge=1),
    aps: int = Query(100, ge=1, le=100),
    aq: Optional[str] = Query(None),
):
    ah = _assignment_history()
    raw = _load_json(IC_QUOTAS_PATH)
    people = []
    today = ah.as_of_today()
    for name, cfg in raw.items():
        if name.startswith("_") or not isinstance(cfg, dict):
            continue
        assignments = ah.ensure_assignments(cfg)
        people.append({
            "name": name,
            "division": ah.current_division(assignments, today) or (cfg.get("division") or ""),
            "type": cfg.get("type") or "IC",
            "reporting_manager": cfg.get("reporting_manager") or None,
            "q1_quota": cfg.get("q1_quota") or 0,
            "q2_quota": cfg.get("q2_quota") or 0,
            "q3_quota": cfg.get("q3_quota") or 0,
            "q4_quota": cfg.get("q4_quota") or 0,
            "h1_quota": cfg.get("h1_quota"),
            "h2_quota": cfg.get("h2_quota") if cfg.get("h2_quota") is not None else 0,
            "annual_quota": cfg.get("annual_quota"),
            "assignments": assignments,
        })
    people.sort(key=lambda p: (p["division"] or "zzz", p["name"]))
    rules = _load_json(QUOTA_RULES_PATH)
    bu = {k: v for k, v in (rules.get("bu_annual_quotas") or {}).items() if not str(k).startswith("_")}
    out: dict[str, Any] = {"people": people, "bu_annual_quotas": bu}
    # Always attach logins on this GET — Chrome already allows /api/admin/quotas.
    # A second URL (/users, /logins, /directory) returns HTML 403 in their browser.
    page = ap or 1
    try:
        items, total = user_service.list_users(db, page=page, page_size=aps, q=aq)
        out["accounts"] = {
            "items": [user_out(u) for u in items],
            "total": total,
            "page": page,
            "page_size": aps,
        }
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    out["crm"] = _sync_status_payload()
    return out


def _apply_quota_account(request: Request, op: QuotaAccountOp, user: User, db: Session) -> dict[str, Any]:
    kind = (op.op or "").strip().lower()
    if kind == "create":
        body = AdminUserCreate(
            username=op.username,
            email=op.email or "",
            full_name=op.full_name or "",
            role=op.role or "user",
            password=op.password or None,
            employee_name=op.employee_name,
        )
        created = _create_user_impl(request, body, user, db)
        return {"ok": True, "account": created}
    if kind == "update":
        if op.id is None:
            raise HTTPException(status_code=400, detail="User id is required")
        body = AdminUserUpdate(
            email=op.email,
            full_name=op.full_name,
            role=op.role,
            employee_name=op.employee_name,
            is_active=op.is_active,
            password=op.password,
        )
        updated = _update_user_impl(request, op.id, body, user, db)
        return {"ok": True, "account": updated}
    if kind == "delete":
        if op.id is None:
            raise HTTPException(status_code=400, detail="User id is required")
        _delete_user_impl(request, op.id, user, db)
        return {"ok": True, "deleted_id": op.id}
    raise HTTPException(status_code=400, detail="Unknown account operation")


@router.put("/quotas")
def save_quotas(
    request: Request,
    body: QuotaSaveRequest,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.sync_cancel and not body.people and body.account is None and not body.sync:
        try:
            out = vtiger_sync_service.cancel_vtiger_sync()
        except VtigerSyncError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
        out["crm"] = _sync_status_payload()
        return out
    if body.sync and not body.people and body.account is None and body.sync_schedule is None:
        return _start_vtiger_sync("all")
    if body.sync_schedule is not None and not body.people and body.account is None and not body.sync:
        try:
            schedule = sync_schedule_service.save_schedule(body.sync_schedule.model_dump())
        except SyncScheduleError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
        crm = _sync_status_payload()
        crm["schedule"] = schedule
        return {"ok": True, "crm": crm}
    if body.account is not None and not body.people:
        return _apply_quota_account(request, body.account, user, db)
    if body.history is not None and not body.people:
        try:
            return roster_service.replace_history(
                db,
                body.history.name,
                [row.model_dump() for row in body.history.assignments],
                actor_id=user.id,
            )
        except RosterServiceError as exc:
            _log.warning(
                "history_replace_failed ts=%s user_id=%s method=%s path=%s status=%s detail=%s",
                datetime.utcnow().isoformat(),
                user.id,
                request.method,
                request.url.path,
                exc.status_code,
                exc.message,
            )
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    if not body.people:
        raise HTTPException(status_code=400, detail="At least one IC quota row is required")
    _reject_if_syncing()

    ah = _assignment_history()
    today = ah.as_of_today()
    seen: set[str] = set()
    prev = _load_json(IC_QUOTAS_PATH)
    if not isinstance(prev, dict):
        prev = {}
    out: dict[str, Any] = {}
    for p in body.people:
        name = " ".join(p.name.split())
        if not name:
            continue
        if name in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate name: {name}")
        seen.add(name)
        existing = prev.get(name) if isinstance(prev.get(name), dict) else {}
        kept = {k: v for k, v in existing.items() if str(k).startswith("_")}
        requested = ah.normalize_division(p.division)
        base = ah.ensure_assignments(existing) if existing else []
        if not base:
            client_rows = [r.model_dump() for r in (p.assignments or [])]
            base = ah.ensure_assignments({"division": requested, "assignments": client_rows})
        current = ah.current_division(base, today)
        try:
            if requested and current and requested != current:
                if p.rtm_correction:
                    assignments = ah.correct_current_division(base, requested, today)
                else:
                    start = ah.parse_date(p.transfer_start)
                    if start is None:
                        raise ah.AssignmentError(
                            f"Say when {name} joined {requested}"
                        )
                    assignments = ah.apply_transfer(base, requested, start)
            elif p.assignments:
                assignments = ah.serialize_assignments([r.model_dump() for r in p.assignments])
                if not assignments:
                    assignments = base
                ah.validate_assignments(assignments)
            else:
                assignments = base
                ah.validate_assignments(assignments)
        except ah.AssignmentError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        as_of = ah.current_division(assignments, today) or requested
        # H1 / H2 / Annual are Finance-owned. Never derive them from Q1–Q4.
        h1 = float(p.h1_quota) if p.h1_quota is not None else 0.0
        h2 = float(p.h2_quota) if p.h2_quota is not None else 0.0
        annual = float(p.annual_quota) if p.annual_quota is not None else 0.0
        out[name] = {
            **kept,
            "division": as_of,
            "type": (p.type or "IC").strip() or "IC",
            "reporting_manager": (p.reporting_manager or "").strip() or None,
            "q1_quota": round(float(p.q1_quota or 0), 4),
            "q2_quota": round(float(p.q2_quota or 0), 4),
            "q3_quota": round(float(p.q3_quota or 0), 4),
            "q4_quota": round(float(p.q4_quota or 0), 4),
            "h1_quota": round(h1, 4),
            "h2_quota": round(h2, 4),
            "annual_quota": round(annual, 4),
            "assignments": assignments,
        }

    _atomic_write_json(IC_QUOTAS_PATH, out)

    if body.bu_annual_quotas is not None:
        rules = _load_json(QUOTA_RULES_PATH)
        if not isinstance(rules, dict):
            rules = {}
        existing = rules.get("bu_annual_quotas") or {}
        comment = existing.get("_comment") if isinstance(existing, dict) else None
        cleaned: dict[str, Any] = {}
        if comment:
            cleaned["_comment"] = comment
        for bu, divs in body.bu_annual_quotas.items():
            if not bu or bu.startswith("_"):
                continue
            cleaned[bu] = {k: float(v) for k, v in (divs or {}).items() if not str(k).startswith("_")}
        rules["bu_annual_quotas"] = cleaned
        _atomic_write_json(QUOTA_RULES_PATH, rules)

    try:
        _run_parse()
    except Exception:
        _log.exception("quota_save_rebuild_failed")
        raise HTTPException(status_code=500, detail="Quotas saved but dashboard rebuild failed") from None

    seed_users(db)
    return {"ok": True, "message": f"Saved {len(out)} people and rebuilt dashboard", "count": len(out)}


@router.get("/templates/data")
def download_data_template(user: Annotated[User, Depends(require_admin)]):
    path = settings.files_dir / "Galaxy_Data_Templates.xlsx"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Galaxy_Data_Templates.xlsx is not in the files folder")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="Galaxy_Data_Templates.xlsx",
    )


@router.post("/quotas/import")
def import_t1_template(
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
):
    name = (file.filename or "").lower()
    if not name.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload the Finance .xlsx template (T1 sheet)")
    max_bytes = 5 * 1024 * 1024
    content = file.file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="Template is too large (max 5 MB)")
    try:
        rows = parse_t1_workbook(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        _log.exception("t1_import_parse_failed")
        raise HTTPException(status_code=400, detail="Could not read workbook") from None

    ah = _assignment_history()
    today = ah.as_of_today()
    prev = _load_json(IC_QUOTAS_PATH)
    if not isinstance(prev, dict):
        prev = {}
    people: list[IcQuotaPerson] = []
    for row in rows:
        person = IcQuotaPerson(**row)
        existing = prev.get(person.name) if isinstance(prev.get(person.name), dict) else {}
        current = ah.current_division(ah.ensure_assignments(existing), today) if existing else ""
        requested = ah.normalize_division(person.division)
        if existing and requested and current and requested != current:
            person.transfer_start = today.isoformat()
        people.append(person)
    body = QuotaSaveRequest(people=people)
    result = save_quotas(body, user, db)
    result["message"] = f"Imported {result['count']} people from {file.filename} and rebuilt dashboard"
    return result


@router.post("/reparse", response_model=UploadResult)
def reparse(user: Annotated[User, Depends(require_admin)], db: Annotated[Session, Depends(get_db)]):
    _reject_if_syncing()
    try:
        _run_parse()
    except Exception:
        _log.exception("reparse_failed")
        raise HTTPException(status_code=500, detail="Rebuild failed") from None
    seed_users(db)
    return UploadResult(ok=True, message="Dashboard data regenerated from SQLite deals + quotas", regenerated=True)


@router.get("/vtiger-sync/status")
def vtiger_sync_status(
    user: Annotated[User, Depends(require_admin)],
    job_id: Optional[str] = Query(None),
):
    return _sync_status_payload(job_id)


@router.post("/vtiger-sync")
def vtiger_sync_trigger(
    user: Annotated[User, Depends(require_admin)],
    quarter: str = "all",
):
    return _start_vtiger_sync(quarter)


def _list_users_impl(
    request: Request,
    user: User,
    db: Session,
    page: int,
    page_size: int,
    q: Optional[str],
):
    try:
        items, total = user_service.list_users(db, page=page, page_size=page_size, q=q)
        return AdminUserList(
            items=[user_out(u) for u in items],
            total=total,
            page=page,
            page_size=page_size,
        )
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    except Exception:
        _log.exception(
            "user_list_failed ts=%s user_id=%s path=%s",
            datetime.utcnow().isoformat(),
            user.id,
            request.url.path,
        )
        raise HTTPException(status_code=500, detail="Could not load users") from None


@router.get("/directory", response_model=AdminUserList)
def list_directory(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
):
    return _list_users_impl(request, user, db, page, page_size, q)


@router.get("/logins", response_model=AdminUserList, include_in_schema=False)
def list_logins(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
):
    return _list_users_impl(request, user, db, page, page_size, q)


@router.get("/users", response_model=AdminUserList, include_in_schema=False)
def list_users(
    request: Request,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
):
    return _list_users_impl(request, user, db, page, page_size, q)


def _create_user_impl(request: Request, body: AdminUserCreate, user: User, db: Session):
    try:
        created = user_service.create_user(
            db,
            actor=user,
            username=body.username,
            email=body.email,
            full_name=body.full_name,
            role=body.role,
            password=body.password,
            employee_name=body.employee_name,
        )
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    return user_out(created)


@router.post("/directory", response_model=UserOut)
def create_directory_login(
    request: Request,
    body: AdminUserCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _create_user_impl(request, body, user, db)


@router.post("/logins", response_model=UserOut, include_in_schema=False)
def create_login(
    request: Request,
    body: AdminUserCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _create_user_impl(request, body, user, db)


@router.post("/users", response_model=UserOut, include_in_schema=False)
def create_user(
    request: Request,
    body: AdminUserCreate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _create_user_impl(request, body, user, db)


def _update_user_impl(request: Request, user_id: int, body: AdminUserUpdate, user: User, db: Session):
    try:
        updated = user_service.update_user(
            db,
            actor=user,
            user_id=user_id,
            email=body.email,
            full_name=body.full_name,
            role=body.role,
            employee_name=body.employee_name,
            is_active=body.is_active,
            password=body.password,
        )
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    return user_out(updated)


@router.patch("/directory/{user_id}", response_model=UserOut)
def update_directory_login(
    request: Request,
    user_id: int,
    body: AdminUserUpdate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _update_user_impl(request, user_id, body, user, db)


@router.patch("/logins/{user_id}", response_model=UserOut, include_in_schema=False)
def update_login(
    request: Request,
    user_id: int,
    body: AdminUserUpdate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _update_user_impl(request, user_id, body, user, db)


@router.patch("/users/{user_id}", response_model=UserOut, include_in_schema=False)
def update_user(
    request: Request,
    user_id: int,
    body: AdminUserUpdate,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _update_user_impl(request, user_id, body, user, db)


def _delete_user_impl(request: Request, user_id: int, user: User, db: Session):
    try:
        user_service.delete_user(db, actor=user, user_id=user_id)
    except UserServiceError as exc:
        raise _user_error(request, user, exc) from None
    return {"ok": True}


@router.delete("/directory/{user_id}")
def delete_directory_login(
    request: Request,
    user_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _delete_user_impl(request, user_id, user, db)


@router.delete("/logins/{user_id}", include_in_schema=False)
def delete_login(
    request: Request,
    user_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _delete_user_impl(request, user_id, user, db)


@router.delete("/users/{user_id}", include_in_schema=False)
def delete_user(
    request: Request,
    user_id: int,
    user: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    return _delete_user_impl(request, user_id, user, db)
