"""Utilidades para preparar datos (fase Arrange) en las pruebas."""

import os
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta

import jwt
from sqlalchemy.orm import Session

from app.core import clock
from app.models import Category, MysteryBox, Plan, Product, ProductVariant, Profile, Subscription
from app.models.enums import Role

ISSUER = "https://test-project.supabase.co/auth/v1"


def make_token(
    user_id: uuid.UUID,
    *,
    email: str | None = None,
    metadata: dict | None = None,
    expires_in: int = 3600,
    secret: str | None = None,
    audience: str = "authenticated",
    issuer: str = ISSUER,
    role: str = "authenticated",
) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email or f"{user_id.hex[:8]}@example.com",
        "aud": audience,
        "iss": issuer,
        "role": role,
        "iat": now,
        "exp": now + expires_in,
        "user_metadata": metadata or {},
    }
    return jwt.encode(payload, secret or os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")


@dataclass
class TestUser:
    id: uuid.UUID
    email: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {make_token(self.id, email=self.email)}"}


def new_user() -> TestUser:
    user_id = uuid.uuid4()
    return TestUser(id=user_id, email=f"cliente-{user_id.hex[:6]}@example.com")


def create_admin(db: Session) -> TestUser:
    user = new_user()
    db.add(Profile(id=user.id, email=user.email, full_name="Admin Pruebas", role=Role.admin))
    db.commit()
    return user


def create_variant(
    db: Session, *, stock: int = 5, price: int = 100_000, active: bool = True, name: str | None = None
) -> ProductVariant:
    suffix = uuid.uuid4().hex[:6]
    category = Category(name=f"Cat {suffix}", slug=f"cat-{suffix}")
    product = Product(
        name=name or f"Set prueba {suffix}",
        slug=f"set-{suffix}",
        description="Producto de prueba",
        base_price=price,
        category=category,
        is_active=active,
    )
    variant = ProductVariant(product=product, sku=f"SKU-{suffix}", size="M", color="Lila", stock_on_hand=stock)
    db.add_all([category, product, variant])
    db.commit()
    db.refresh(variant)
    return variant


def create_plan(db: Session, *, price: int | None = None, duration_days: int = 30, code: str = "plus-mensual") -> Plan:
    plan = Plan(code=code, name="S2 Plus mensual", price=price, duration_days=duration_days, benefits=["Retos"])
    db.add(plan)
    db.commit()
    return plan


def place_order(client, user: TestUser, variant_id: int, quantity: int = 1):
    return client.post("/api/v1/orders", json={"items": [{"variant_id": variant_id, "quantity": quantity}]},
                       headers=user.headers)


def payment_for(client, admin: TestUser, reference: str) -> dict:
    payments = client.get("/api/v1/admin/payments", headers=admin.headers).json()
    return next(p for p in payments if p["operation_reference"] == reference)


SUPABASE_STORAGE = "https://test-project.supabase.co/storage/v1/object/public/product-images"


def create_box(db: Session, *, access: str = "plus", active: bool = True, title: str = "Caja Soul", sort_order: int = 0) -> MysteryBox:
    box = MysteryBox(
        title=title, teaser="Una sorpresa para ti", cover_url=f"{SUPABASE_STORAGE}/s2box/portada.jpg",
        cover_alt="Caja cerrada", content_media_url=f"{SUPABASE_STORAGE}/content/secreto.mp4",
        content_description="Contenido secreto de la caja", content_access=access, is_active=active, sort_order=sort_order,
    )
    db.add(box)
    db.commit()
    db.refresh(box)
    return box


def activate_membership(client, db: Session, user: TestUser) -> None:
    """Crea el perfil (primera llamada autenticada) y le da una suscripción activa."""
    client.get("/api/v1/me", headers=user.headers)
    plan = create_plan(db, code=f"plan-{uuid.uuid4().hex[:6]}", price=80_000)
    now = clock.now()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active",
                        starts_at=now - timedelta(days=1), ends_at=now + timedelta(days=29)))
    db.commit()
