from fastapi import APIRouter

from app.api.v1 import catalog, challenges, content, habits, me, orders, routines, s2box, settings, subscriptions
from app.api.v1.admin import box_images as admin_box_images
from app.api.v1.admin import catalog as admin_catalog
from app.api.v1.admin import memberships as admin_memberships
from app.api.v1.admin import routines as admin_routines
from app.api.v1.admin import sales as admin_sales
from app.api.v1.admin import settings as admin_settings
from app.api.v1.admin import users as admin_users
from app.api.v1.admin import wellness as admin_wellness

api_router = APIRouter(prefix="/api/v1")
for module in (catalog, me, orders, subscriptions, content, habits, challenges, routines, s2box, settings):
    api_router.include_router(module.router)

# Cada endpoint administrativo declara AdminUser, que exige el rol "admin" en el backend.
admin_router = APIRouter(prefix="/admin")
for module in (admin_catalog, admin_sales, admin_memberships, admin_wellness, admin_users, admin_settings, admin_routines, admin_box_images):
    admin_router.include_router(module.router)
api_router.include_router(admin_router)
