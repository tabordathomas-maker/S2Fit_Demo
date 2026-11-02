from enum import StrEnum


class Role(StrEnum):
    customer = "customer"
    admin = "admin"


class OrderStatus(StrEnum):
    pending_payment = "pending_payment"
    paid = "paid"
    cancelled = "cancelled"
    expired = "expired"
    refunded = "refunded"


class ReservationStatus(StrEnum):
    active = "active"
    released = "released"
    consumed = "consumed"


class MovementKind(StrEnum):
    reserve = "reserve"
    release = "release"
    sale = "sale"
    adjustment = "adjustment"


class PaymentKind(StrEnum):
    order = "order"
    subscription = "subscription"


class PaymentStatus(StrEnum):
    pending = "pending"
    in_review = "in_review"
    confirmed = "confirmed"
    rejected = "rejected"
    refunded = "refunded"
    cancelled = "cancelled"


class PaymentMethod(StrEnum):
    transfer = "transfer"
    deposit = "deposit"
    cash = "cash"
    other = "other"


class SubscriptionStatus(StrEnum):
    pending_payment = "pending_payment"
    active = "active"
    expired = "expired"
    cancelled = "cancelled"


class SubscriptionRequestKind(StrEnum):
    new = "new"
    renewal = "renewal"


class SubscriptionRequestStatus(StrEnum):
    pending_payment = "pending_payment"
    paid = "paid"
    rejected = "rejected"
    cancelled = "cancelled"


class ContentKind(StrEnum):
    routine = "routine"
    recipe = "recipe"
    growth = "growth"
    meal = "meal"


class AccessLevel(StrEnum):
    free = "free"
    plus = "plus"


class RewardKind(StrEnum):
    habit_discount = "habit_discount"
    challenge = "challenge"


class RedemptionStatus(StrEnum):
    requested = "requested"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class RoutineStatus(StrEnum):
    draft = "draft"
    active = "active"
    archived = "archived"
