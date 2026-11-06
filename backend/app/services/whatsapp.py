"""Textos precargados para WhatsApp. El frontend arma el enlace wa.me con el número comercial."""

from app.models import Order, SubscriptionRequest
from app.models.enums import SubscriptionRequestKind


def format_cop(amount: int) -> str:
    return "$" + f"{amount:,}".replace(",", ".") + " COP"


def order_message(order: Order) -> str:
    lines = [
        "Hola, quiero comprar en S2 Fit.",
        f"Mi referencia de pedido es {order.reference}.",
        "",
        "Productos:",
    ]
    lines += [f"- {i.quantity} x {i.product_name} ({i.variant_label}) - {format_cop(i.line_total)}" for i in order.items]
    lines += [
        "",
        f"Total estimado: {format_cop(order.total)}",
        "Quisiera confirmar las instrucciones de pago y entrega.",
    ]
    return "\n".join(lines)


def subscription_message(request: SubscriptionRequest) -> str:
    action = "renovar mi suscripción a S2 Box" if request.kind == SubscriptionRequestKind.renewal else "suscribirme a S2 Box"
    return (
        f"Hola, quiero {action}. Elegí el plan {request.plan.name}. "
        "Quisiera confirmar el precio, la vigencia y los medios de pago por convenio. "
        f"Mi referencia de solicitud es {request.reference}."
    )


def box_claim_message(client_name: str, reference: str) -> str:
    return f"Soy {client_name} quiero reclamar mi S2 Box con referencia {reference}"
