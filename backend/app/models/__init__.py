"""Importa todos los modelos para que SQLAlchemy y Alembic conozcan el esquema completo."""

from app.models.audit import AdminAuditLog
from app.models.base import Base
from app.models.catalog import Category, InventoryMovement, Product, ProductVariant
from app.models.content import ContentItem
from app.models.orders import Order, OrderItem
from app.models.payments import Payment
from app.models.subscriptions import Plan, Subscription, SubscriptionRenewal, SubscriptionRequest
from app.models.user import Profile
from app.models.wellness import (
    Challenge,
    ChallengeParticipation,
    HabitLog,
    Reward,
    RewardRedemption,
    UserHabit,
)

__all__ = [
    "AdminAuditLog",
    "Base",
    "Category",
    "Challenge",
    "ChallengeParticipation",
    "ContentItem",
    "HabitLog",
    "InventoryMovement",
    "Order",
    "OrderItem",
    "Payment",
    "Plan",
    "Product",
    "ProductVariant",
    "Profile",
    "Reward",
    "RewardRedemption",
    "Subscription",
    "SubscriptionRenewal",
    "SubscriptionRequest",
    "UserHabit",
]
