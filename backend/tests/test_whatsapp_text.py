"""Los mensajes de WhatsApp firman como «S2 Fit», no «S2 Fit Evolution»."""

from types import SimpleNamespace

from app.models.enums import SubscriptionRequestKind
from app.services.whatsapp import order_message, subscription_message


def test_order_message_says_s2_fit_without_evolution():
    # Arrange
    item = SimpleNamespace(quantity=1, product_name="Set Ocean", variant_label="Negro", line_total=140000)
    order = SimpleNamespace(reference="S2-ORD-0001", items=[item], total=140000)

    # Act
    text = order_message(order)

    # Assert
    assert "S2 Fit" in text
    assert "Evolution" not in text


def test_subscription_message_has_no_evolution():
    # Arrange
    request = SimpleNamespace(kind=SubscriptionRequestKind.renewal, plan=SimpleNamespace(name="Mensual"), reference="S2-SUB-0001")

    # Act
    text = subscription_message(request)

    # Assert
    assert "Evolution" not in text
