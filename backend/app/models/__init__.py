"""Importa todos los modelos para que SQLAlchemy y Alembic conozcan el esquema completo."""

from app.models.access_codes import AccessCode
from app.models.audit import AdminAuditLog
from app.models.base import Base
from app.models.box_claims import BoxClaim
from app.models.box_images import BoxImage
from app.models.catalog import Category, InventoryMovement, Product, ProductVariant
from app.models.content import ContentItem
from app.models.mystery_boxes import MysteryBox
from app.models.orders import Order, OrderItem
from app.models.payments import Payment
from app.models.routines import CustomRoutine, RoutineStep, RoutineStepCompletion
from app.models.settings import SiteSettings
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
    "AccessCode",
    "AdminAuditLog",
    "Base",
    "BoxClaim",
    "BoxImage",
    "Category",
    "Challenge",
    "ChallengeParticipation",
    "ContentItem",
    "CustomRoutine",
    "HabitLog",
    "InventoryMovement",
    "MysteryBox",
    "Order",
    "OrderItem",
    "Payment",
    "Plan",
    "Product",
    "ProductVariant",
    "Profile",
    "Reward",
    "SiteSettings",
    "RewardRedemption",
    "RoutineStep",
    "RoutineStepCompletion",
    "Subscription",
    "SubscriptionRenewal",
    "SubscriptionRequest",
    "UserHabit",
]
