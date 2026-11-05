"""Auditoría en tarjetas: frases en español por evento y vista por cliente, sin JSON ni UUIDs."""

import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import event

from app.core.database import engine
from app.models import AdminAuditLog, Payment, Profile
from app.services import audit_presenter as presenter
from tests.factories import create_admin, create_plan, create_variant, new_user, payment_for, place_order
from tests.test_subscriptions import _pay, _request

ADMIN = "/api/v1/admin"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def _events(client, admin, **params):
    return client.get(f"{ADMIN}/audit-logs", params=params, headers=admin.headers).json()


def _clients(client, admin, **params):
    return client.get(f"{ADMIN}/audit/clients", params=params, headers=admin.headers).json()


def _confirm_order(client, admin, order):
    payment = payment_for(client, admin, order["reference"])
    body = {"operation_reference": order["reference"], "amount": order["total"], "method": "transfer", "external_reference": f"BANCO-{uuid.uuid4().hex[:8]}"}
    assert client.post(f"{ADMIN}/payments/{payment['id']}/confirm", json=body, headers=admin.headers).status_code == 200
    return payment


def _customer_with_order_and_subscription(client, db):
    admin, user = create_admin(db), new_user()
    db.add(Profile(id=user.id, email=user.email, full_name="Laura Gómez", phone="3001234567"))
    db.commit()
    variant = create_variant(db, stock=5, price=125_000, name="Set Ocean")
    order = place_order(client, user, variant.id).json()
    _confirm_order(client, admin, order)
    create_plan(db)
    request = _request(client, user).json()
    assert _pay(client, admin, request).status_code == 200
    return admin, user, order, request


# ---------- vista por cliente ----------


def test_client_card_has_orders_payments_subscription_and_timeline(client, db):
    # Arrange
    admin, user, order, request = _customer_with_order_and_subscription(client, db)

    # Act
    body = _clients(client, admin)

    # Assert
    assert body["total"] == 1
    card = body["clients"][0]
    assert card["name"] == "Laura Gómez" and card["email"] == user.email and card["phone"] == "3001234567"
    order_card = card["orders"][0]
    assert order_card["reference"] == order["reference"] and order_card["total"] == 125_000
    assert order_card["status"] == {"label": "Pagado", "tone": "success"}
    assert order_card["payment"] == {"label": "Confirmado", "tone": "success"}
    assert any(e["phrase"] == f"confirmó el pago de {order['reference']} ($125.000)" and e["admin"] == "Admin Pruebas" for e in order_card["events"])
    assert order_card["events"][0]["changes"][0] == {"field": "Estado", "before": "Pendiente", "after": "Confirmado"}
    request_card = card["requests"][0]
    assert request_card["reference"] == request["reference"] and request_card["plan"] == "S2 Plus mensual"
    assert card["subscription"]["status"] == {"label": "Activa", "tone": "success"}
    assert re.match(r"Activa hasta \d{1,2} \w{3} \d{4}$", card["subscription"]["text"])
    phrases = [e["phrase"] for e in order_card["events"] + card["subscription"]["events"]]
    assert "details" not in card and not any(UUID_RE.search(p) for p in phrases)


def test_current_status_comes_from_the_tables_not_from_the_audit_trail(client, db):
    # Arrange
    admin, user, order, _ = _customer_with_order_and_subscription(client, db)
    db.query(Payment).filter(Payment.order_id.is_not(None)).update({"status": "refunded"})
    db.commit()

    # Act
    card = _clients(client, admin)["clients"][0]

    # Assert
    assert card["orders"][0]["payment"] == {"label": "Reembolsado", "tone": "danger"}
    assert any("confirmó el pago" in e["phrase"] for e in card["orders"][0]["events"])


def test_clients_search_by_reference_email_and_phone_and_pagination(client, db):
    # Arrange
    admin, user, order, request = _customer_with_order_and_subscription(client, db)
    other = new_user()
    db.add(Profile(id=other.id, email=other.email, full_name="Ana Ruiz", phone="3109998877"))
    db.commit()
    variant = create_variant(db, stock=5, name="Set Coco")
    _confirm_order(client, admin, place_order(client, other, variant.id).json())

    # Act
    by_order = _clients(client, admin, q=order["reference"][-6:])
    by_request = _clients(client, admin, q=request["reference"])
    by_email = _clients(client, admin, q=user.email)
    by_phone = _clients(client, admin, q="3109998877")
    first = _clients(client, admin, limit=1)
    second = _clients(client, admin, limit=1, offset=1)

    # Assert
    assert [c["name"] for c in by_order["clients"]] == ["Laura Gómez"]
    assert [c["name"] for c in by_request["clients"]] == ["Laura Gómez"]
    assert [c["name"] for c in by_email["clients"]] == ["Laura Gómez"]
    assert [c["name"] for c in by_phone["clients"]] == ["Ana Ruiz"]
    assert first["total"] == second["total"] == 2
    assert {first["clients"][0]["name"], second["clients"][0]["name"]} == {"Laura Gómez", "Ana Ruiz"}


def test_clients_period_uses_bogota_days(client, db):
    # Arrange
    admin, user, order, _ = _customer_with_order_and_subscription(client, db)
    late = datetime(2026, 3, 10, 23, 30, tzinfo=ZoneInfo("America/Bogota"))
    db.query(AdminAuditLog).update({"created_at": late})
    db.commit()

    # Act
    same_day = _clients(client, admin, **{"from": "2026-03-10", "to": "2026-03-10"})
    next_day = _clients(client, admin, **{"from": "2026-03-11", "to": "2026-03-11"})

    # Assert
    assert same_day["total"] == 1 and next_day["total"] == 0 and next_day["clients"] == []


# ---------- vista por evento ----------


def test_product_price_change_reads_as_a_card_with_formatted_values(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, name="Set Ocean", price=140_000)

    # Act
    client.patch(f"{ADMIN}/products/{variant.product.id}", json={"base_price": 145_000}, headers=admin.headers)
    body = _events(client, admin)

    # Assert
    log = body["events"][0]
    assert body["total"] == 1 and log["category"] == "Catálogo"
    assert log["entity"] == {"type": "Producto", "name": "Set Ocean"}
    assert log["phrase"] == "editó el producto «Set Ocean»"
    assert log["changes"] == [{"field": "Precio", "before": "$140.000", "after": "$145.000"}]
    assert re.match(r"\d{1,2} \w{3} 20\d\d, \d{1,2}:\d{2} [ap]\. m\.$", log["when"])


def test_payment_confirmation_event_has_category_reference_amount_and_transition(client, db):
    # Arrange
    admin = create_admin(db)
    order = place_order(client, new_user(), create_variant(db, price=90_000).id).json()
    _confirm_order(client, admin, order)

    # Act
    log = _events(client, admin, category="Pagos")["events"][0]

    # Assert
    assert log["phrase"] == f"confirmó el pago de {order['reference']} ($90.000)"
    assert log["reference"] == order["reference"] and log["category"] == "Pagos"
    assert log["changes"] == [{"field": "Estado", "before": "Pendiente", "after": "Confirmado"}]


def test_content_update_shows_title_and_changed_fields_and_deleted_entities_keep_their_name(client, db):
    # Arrange
    from app.models import ContentItem

    admin = create_admin(db)
    item = ContentItem(kind="routine", title="Full body", body="x")
    db.add(item)
    db.commit()
    client.patch(f"{ADMIN}/content/{item.id}", json={"title": "Full body en casa", "is_published": False}, headers=admin.headers)
    client.delete(f"{ADMIN}/content/{item.id}", headers=admin.headers)

    # Act
    events = _events(client, admin, category="Contenido")["events"]

    # Assert
    deleted, updated = events[0], events[1]
    assert deleted["phrase"] == "eliminó el contenido «Full body en casa»" or deleted["phrase"] == "eliminó el contenido «Full body»"
    assert updated["entity"]["name"] == "(eliminado)" or "Full body" in updated["entity"]["name"]
    fields = {c["field"]: (c["before"], c["after"]) for c in updated["changes"]}
    assert fields["Título"] == ("Full body", "Full body en casa") and fields["Publicado"] == ("Sí", "No")


def test_no_response_has_raw_details_or_uuids_in_phrases(client, db):
    # Arrange
    admin, user, order, request = _customer_with_order_and_subscription(client, db)
    client.post(f"{ADMIN}/users/{user.id}/membership/grant", json={"days": 10, "reason": "Cortesía"}, headers=admin.headers)

    # Act
    events = _events(client, admin, limit=100)["events"]

    # Assert
    assert events and all("details" not in e and "{" not in e["phrase"] for e in events)
    assert not any(UUID_RE.search(e["phrase"]) for e in events)
    assert any(e["phrase"].startswith("activó S2 Box a Laura Gómez por 10 días: Cortesía") for e in events)


def test_audit_routes_401_403(client, db):
    # Arrange
    customer = new_user()

    # Act / Assert
    for path in ("/audit-logs", "/audit/clients"):
        assert client.get(f"{ADMIN}{path}").status_code == 401
        assert client.get(f"{ADMIN}{path}", headers=customer.headers).status_code == 403


def test_query_count_does_not_grow_with_the_number_of_events(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, name="Set Ocean")
    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        statements.append(statement)

    def count_for(n: int) -> int:
        for _ in range(n):
            client.patch(f"{ADMIN}/products/{variant.product.id}", json={"base_price": 100_000 + len(statements) + _}, headers=admin.headers)
        statements.clear()
        event.listen(engine, "before_cursor_execute", record)
        try:
            client.get(f"{ADMIN}/audit-logs", params={"limit": 100}, headers=admin.headers)
        finally:
            event.remove(engine, "before_cursor_execute", record)
        return len(statements)

    # Act
    few = count_for(3)
    many = count_for(47)

    # Assert
    assert many <= few + 1


# ---------- cobertura ----------

APP = Path(__file__).resolve().parents[1] / "app"


def _sources() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in APP.rglob("*.py") if p.name != "audit_presenter.py")


def test_every_audited_action_has_a_phrase_in_the_registry():
    # Arrange
    source = _sources()
    flat = re.sub(r"\s+", " ", source)
    expected = set(re.findall(r'audit\.record\( ?db, admin, "([a-z_]+\.[a-z_]+)"', flat))
    for entity in re.findall(r'apply_update\( ?db, admin, \w+, "([a-z_]+)"', flat) + re.findall(r'_update\(db, admin, \w+, \w+, \w+, "([a-z_]+)"', flat):
        expected.add(f"{entity}.update")
    for entity in re.findall(r'set_archived\( ?db, admin, \w+, "([a-z_]+)"', flat) + re.findall(r'_archive\(db, admin, \w+, \w+, "([a-z_]+)"', flat):
        expected |= {f"{entity}.archive", f"{entity}.restore"}
    for prefix in re.findall(r'delete_or_soft_delete\( ?db, admin, \w+, "[a-z_]+", [\w.]+, "([a-z_]+)"', flat):
        expected |= {f"{prefix}.delete", f"{prefix}.soft_delete"}
    for entity in re.findall(r'_create\(db, admin, \w+, \w+, "([a-z_]+)"', flat):
        expected.add(f"{entity}.create")

    # Act
    missing = sorted(a for a in expected if a not in presenter.REGISTRY)

    # Assert
    assert len(expected) > 40, "el regex no encontró suficientes acciones"
    assert missing == []
    assert {"plan.soft_delete", "product.soft_delete", "variant.soft_delete", "settings.whatsapp_update"} <= set(presenter.REGISTRY)
