"""Carga datos de DEMOSTRACIÓN (marcados con is_demo=True).

Los precios vienen del prototipo y NO son precios comerciales definitivos. El plan
S2 Box se crea sin precio ("Consulta el precio por WhatsApp").

Uso:  python -m scripts.seed_demo            (desarrollo)
      python -m scripts.seed_demo --allow-production
Es idempotente: no duplica registros si se ejecuta varias veces.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models import Category, Challenge, ContentItem, Plan, Product, ProductVariant, Reward

CATEGORIES = [
    ("Conjuntos", "conjuntos", "Sets de top + short o legging."),
    ("Shorts", "shorts", "Shorts seamless de tiro alto."),
    ("Leggings", "leggings", "Leggings seamless."),
    ("Tops", "tops", "Tops deportivos."),
    ("Enterizos", "enterizos", "Monos y enterizos."),
]

# (slug, nombre, descripción, precio de ejemplo, categoría, color, imagen)
PRODUCTS = [
    ("shorts-seamless-azul-hueso", "Shorts seamless azul y hueso", "Pack de 2 shorts de tiro alto", 120000, "shorts", "Azul y hueso", "products/shorts-azul-hueso.svg"),
    ("set-azul-rey", "Set azul rey", "Top waffle con lazo + short tiro alto", 125000, "conjuntos", "Azul rey", "products/set-azul-rey.svg"),
    ("set-aqua", "Set aqua", "Top waffle con lazo + legging", 135000, "conjuntos", "Aqua", "products/set-aqua.svg"),
    ("set-azul-cielo", "Set azul cielo", "Top cruzado + legging scrunch", 140000, "conjuntos", "Azul cielo", "products/set-azul-cielo.svg"),
    ("set-lila", "Set lila", "Top cruzado manga larga + short scrunch", 145000, "conjuntos", "Lila", "products/set-lila.svg"),
    ("mono-negro", "Mono negro", "Mono manga larga con detalle cut-out", 155000, "enterizos", "Negro", "products/mono-negro.jpg"),
]
SIZES = ["S", "M", "L"]
DEMO_STOCK = 5

PLAN = {
    "code": "plus-mensual",
    "name": "S2 Box mensual",
    "description": "Una comunidad más personalizada según tus necesidades y objetivos. Constancia que se recompensa de verdad.",
    "price": None,
    "duration_days": 30,
    "period_label": "mensual",
    "benefits": [
        "Retos de gym progresivos que suben de nivel contigo",
        "Rutinas personalizadas según tus necesidades y objetivos",
        "Comunidad S2 para avanzar acompañada",
        "Seguimiento de hábitos medido por porcentajes",
        "Ideas de alimentación diaria",
        "Recompensas en marcas aliadas",
    ],
}

# (tipo, título, meta, acceso, franja de comida)
CONTENT = [
    ("routine", "Rutina de piernas y glúteos", "Video · 20 min · nivel inicial", "free", None),
    ("routine", "Full body sin equipo", "Video · 25 min · en casa", "free", None),
    ("routine", "Movilidad y estiramiento", "Video · 10 min · para después de estudiar", "free", None),
    ("routine", "Rutina personalizada de fuerza", "Plan semanal · según tu objetivo", "plus", None),
    ("recipe", "Desayuno rápido para días de universidad", "Receta · 10 min", "free", None),
    ("recipe", "Almuerzo balanceado para llevar", "Receta · 30 min", "free", None),
    ("recipe", "Snack saludable post-entreno", "Receta · 5 min", "free", None),
    ("growth", "Cómo crear un hábito sin presionarte", "Lectura · 5 min", "free", None),
    ("growth", "Organiza tu semana entre estudio, trabajo y entreno", "Video · 12 min", "free", None),
    ("growth", "Constancia a tu propio ritmo", "Audio · 8 min", "free", None),
    ("meal", "Desayuno del día", "Alimentación diaria", "plus", "desayuno"),
    ("meal", "Almuerzo del día", "Alimentación diaria", "plus", "almuerzo"),
    ("meal", "Cena del día", "Alimentación diaria", "plus", "cena"),
    ("meal", "Snack del día", "Alimentación diaria", "plus", "snacks"),
]

CHALLENGES = [
    ("Primera semana en Mi Ruta", "Registra tu avance 3 días para arrancar con buen pie.", "free", 3),
    ("7 días de movimiento", "Muévete al menos 20 minutos durante 7 días.", "plus", 7),
    ("Hidratación consciente", "Toma suficiente agua durante 5 días.", "plus", 5),
    ("Sentadillas progresivas", "Suma repeticiones cada día durante 10 días.", "plus", 10),
    ("Sueño reparador", "Duerme 7 horas durante 7 noches.", "plus", 7),
]

# (tipo, nombre, umbral, acceso)
REWARDS = [
    ("habit_discount", "3% dcto. en prendas S2 (ejemplo)", 40, "free"),
    ("habit_discount", "5% dcto. en prendas S2 (ejemplo)", 70, "free"),
    ("habit_discount", "10% dcto. en prendas S2 (ejemplo)", 100, "free"),
    ("challenge", "Descuento en restaurantes aliados", 25, "plus"),
    ("challenge", "Descuento en proteínas y suplementación", 50, "plus"),
    ("challenge", "Bono de regalo S2", 75, "plus"),
    ("challenge", "Acceso a eventos deportivos", 100, "plus"),
]

DEMO_BODY = "[Contenido de demostración] Reemplaza este texto y agrega el enlace del video desde el panel de administración."


def _exists(db: Session, model, **filters) -> bool:
    return db.scalars(select(model).filter_by(**filters)).first() is not None


def seed(db: Session) -> None:
    categories = {}
    for i, (name, slug, description) in enumerate(CATEGORIES):
        category = db.scalars(select(Category).filter_by(slug=slug)).first()
        if category is None:
            category = Category(name=name, slug=slug, description=description, sort_order=i)
            db.add(category)
            db.flush()
        categories[slug] = category

    for slug, name, description, price, category_slug, color, image in PRODUCTS:
        if _exists(db, Product, slug=slug):
            continue
        product = Product(
            slug=slug, name=name, description=description, base_price=price, image_url=image,
            category_id=categories[category_slug].id, is_demo=True,
        )
        product.variants = [
            ProductVariant(sku=f"DEMO-{slug.upper()}-{size}"[:60], size=size, color=color, stock_on_hand=DEMO_STOCK)
            for size in SIZES
        ]
        db.add(product)

    if not _exists(db, Plan, code=PLAN["code"]):
        db.add(Plan(**PLAN))

    for i, (kind, title, meta, access, meal_slot) in enumerate(CONTENT):
        if not _exists(db, ContentItem, title=title):
            db.add(ContentItem(kind=kind, title=title, meta=meta, access=access, meal_slot=meal_slot,
                               summary=meta, body=DEMO_BODY, sort_order=i, is_demo=True))

    for i, (title, description, access, target) in enumerate(CHALLENGES):
        if not _exists(db, Challenge, title=title):
            db.add(Challenge(title=title, description=description, access=access, target_count=target,
                             sort_order=i, is_demo=True))

    for i, (kind, name, threshold, access) in enumerate(REWARDS):
        if not _exists(db, Reward, name=name):
            db.add(Reward(kind=kind, name=name, threshold_pct=threshold, access=access, sort_order=i, is_demo=True))

    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-production", action="store_true")
    args = parser.parse_args()
    if get_settings().environment == "production" and not args.allow_production:
        sys.exit("ENVIRONMENT=production: usa --allow-production si de verdad quieres cargar datos de demostración.")
    with SessionLocal() as db:
        seed(db)
    print("Datos de demostración cargados (is_demo = true).")


if __name__ == "__main__":
    main()
