
import logging
from sqlalchemy import select



from extensions.ext_database import db

from models.account import (
    Tenant
)
from services.errors.account import (
    TenantNotFoundError,
)

logger = logging.getLogger(__name__)


class JKTenantService:
    @staticmethod
    def get_default_tenant() -> Tenant:
        """Get default tenant"""
        tenant = db.session.scalar(select(Tenant).order_by(Tenant.created_at.desc()).limit(1))
        if tenant is None:
            raise TenantNotFoundError()
        return tenant