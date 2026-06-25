import logging
import flask_login
from flask import make_response, request
from flask_restx import Resource
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from werkzeug.exceptions import Unauthorized

from constants.languages import get_valid_language
from controllers.common.schema import register_schema_models
from controllers.console import console_ns
from controllers.console.error import (
    AccountBannedError,
    AccountInFreezeError,
    AccountNotFound,
    NotAllowedCreateWorkspace,
)
from controllers.console.wraps import (
    setup_required,
)
from extensions.ext_database import db
from libs.datetime_utils import naive_utc_now
from libs.helper import EmailStr, extract_remote_ip
from libs.helper import timezone as validate_timezone
from libs.token import (
    clear_access_token_from_cookie,
    clear_csrf_token_from_cookie,
    clear_refresh_token_from_cookie,
    set_access_token_to_cookie,
    set_csrf_token_to_cookie,
    set_refresh_token_to_cookie,
)
from models import AccountStatus
from models.account import Account, Tenant, TenantAccountJoin, TenantAccountRole
from services.account_service import AccountService, RegisterService, TenantService
from services.errors.account import (
    AccountRegisterError,
    CannotOperateSelfError,
    MemberNotInTenantError,
    NoPermissionError,
    RoleAlreadyAssignedError,
    TenantNotFoundError,
)
from services.jk.jk_account_service import JKTenantService

from controllers.console.auth.login import _get_account_with_case_fallback

logger = logging.getLogger(__name__)

JK_ROLE_MAP: dict[int, str] = {
    1: "normal",
    2: "editor",
    3: "owner",
}

JK_STATUS_MAP: dict[int, AccountStatus] = {
    1: AccountStatus.PENDING,
    2: AccountStatus.UNINITIALIZED,
    3: AccountStatus.ACTIVE,
    4: AccountStatus.BANNED,
    5: AccountStatus.CLOSED,
}


class JkAuthSyncPayload(BaseModel):
    name: str = Field(..., description="User name")
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="User password")
    role: str = Field(default="normal", description="User role")
    tenant_id: str | None = Field(default=None, description="Tenant ID; uses default workspace when omitted")

class JkLoginPayload(BaseModel):
    remember_me: bool = Field(default=True, description="Remember me flag")
    user_id: str = Field(description="User ID")
class JkLogoutPayload(BaseModel):
    user_id: str = Field(description="User ID")


class JkRoleUpdatePayload(BaseModel):
    user_id: str = Field(description="User ID")
    role: int = Field(description="Role: 1=normal, 2=editor, 3=owner")

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: int) -> int:
        if value not in JK_ROLE_MAP:
            raise ValueError("Invalid role, must be 1 (normal), 2 (editor), or 3 (owner)")
        return value


class JkStatusUpdatePayload(BaseModel):
    user_id: str = Field(description="User ID")
    status: int = Field(
        description="Status: 1=pending, 2=uninitialized, 3=active, 4=banned, 5=closed",
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: int) -> int:
        if value not in JK_STATUS_MAP:
            raise ValueError(
                "Invalid status, must be 1 (pending), 2 (uninitialized), 3 (active), 4 (banned), or 5 (closed)"
            )
        return value


register_schema_models(
    console_ns,
    JkAuthSyncPayload,
    JkLoginPayload,
    JkLogoutPayload,
    JkRoleUpdatePayload,
    JkStatusUpdatePayload,
)



def _get_tenant_operator(tenant: Tenant) -> Account:
    for role in (TenantAccountRole.OWNER, TenantAccountRole.ADMIN):
        operator_join = db.session.scalar(
            select(TenantAccountJoin)
            .where(TenantAccountJoin.tenant_id == tenant.id, TenantAccountJoin.role == role)
            .limit(1)
        )
        if operator_join is None:
            continue
        operator = db.session.get(Account, operator_join.account_id)
        if operator is not None:
            return operator
    raise AccountNotFound()


def _resolve_tenant(tenant_id: str | None) -> Tenant:
    if tenant_id:
        tenant = TenantService.get_tenant_by_id(db.session, tenant_id)
        if tenant is None:
            raise NotAllowedCreateWorkspace()
        return tenant

    try:
        return JKTenantService.get_default_tenant()
    except TenantNotFoundError as exc:
        raise NotAllowedCreateWorkspace() from exc


def _create_account(name: str, email: str, password: str):
        account = None
        timezone = validate_timezone("Asia/Shanghai")  # 默认东八时区
        try:
            account = _get_account_with_case_fallback(email)
        except Unauthorized as exc:
            raise AccountBannedError() from exc
        except AccountRegisterError:
            raise AccountInFreezeError()

        if account is None:
            try:
                account = AccountService.create_account(
                    email=email,
                    name=name,
                    interface_language=get_valid_language("zh-Hans"),
                    password=password,
                    is_setup=True,
                    timezone=timezone,
                )
                # 激活账户
                account.interface_theme = "light"
                account.status = AccountStatus.ACTIVE
                account.initialized_at = naive_utc_now()
                AccountService.update_account(account)
            except AccountRegisterError:
                raise AccountInFreezeError()
        return account


@console_ns.route("/_jk_login")
class LoginApi(Resource):
    """Resource for user login."""

    @setup_required
    @console_ns.expect(console_ns.models[JkLoginPayload.__name__])
    def post(self):
        """Authenticate user and login."""
        args = JkLoginPayload.model_validate(console_ns.payload)
        account = None
        try:
            account = AccountService.load_logged_in_account(account_id=args.user_id)
        except AccountNotFound:
            raise AccountNotFound()
        if account is None:
            raise AccountNotFound()
        token_pair = AccountService.login(account=account, ip_address=extract_remote_ip(request))
        AccountService.reset_login_error_rate_limit(account.email.lower())
        # Create response with cookies instead of returning tokens in body
        response = make_response({"result": "success", "token_pair": token_pair.model_dump()})
        set_access_token_to_cookie(request, response, token_pair.access_token)
        set_refresh_token_to_cookie(request, response, token_pair.refresh_token)
        set_csrf_token_to_cookie(request, response, token_pair.csrf_token)

        return response

@console_ns.route("/_jk_logout")
class LogoutApi(Resource):
    """Resource for user logout."""
    def post(self):
        """Logout user."""
        args = JkLogoutPayload.model_validate(console_ns.payload)
        account = AccountService.load_logged_in_account(account_id=args.user_id)
        if account is None:
            raise AccountNotFound()
        AccountService.logout(account=account)
        flask_login.logout_user()
        response = make_response({"result": "success"})
        # Clear cookies on logout
        clear_access_token_from_cookie(response)
        clear_refresh_token_from_cookie(response)
        clear_csrf_token_from_cookie(response)

        return response


@console_ns.route("/_jk_role_update")
class RoleUpdateApi(Resource):
    """Resource for updating member role."""

    @setup_required
    @console_ns.expect(console_ns.models[JkRoleUpdatePayload.__name__])
    def post(self):
        """Update member role in the default workspace."""
        args = JkRoleUpdatePayload.model_validate(console_ns.payload)
        new_role = JK_ROLE_MAP[args.role]

        member = AccountService.load_user(args.user_id)
        if member is None:
            raise AccountNotFound()

        tenant = _resolve_tenant(None)
        operator = _get_tenant_operator(tenant)

        try:
            TenantService.update_member_role(tenant, member, new_role, operator)
        except CannotOperateSelfError as exc:
            return {"code": "cannot-operate-self", "message": str(exc)}, 400
        except NoPermissionError as exc:
            return {"code": "forbidden", "message": str(exc)}, 403
        except MemberNotInTenantError as exc:
            return {"code": "member-not-found", "message": str(exc)}, 404
        except RoleAlreadyAssignedError as exc:
            return {"code": "role-already-assigned", "message": str(exc)}, 400

        return {"result": "success"}


@console_ns.route("/_jk_user_create")
class UserCreateApi(Resource):
    """Resource for user login."""
    @setup_required
    @console_ns.expect(console_ns.models[JkAuthSyncPayload.__name__])
    def post(self):
        """Authenticate user and login."""
        args = JkAuthSyncPayload.model_validate(console_ns.payload)
        normalized_email = args.email.lower()
        tenant = _resolve_tenant(args.tenant_id)
        account = _create_account(args.name, normalized_email, args.password)
        TenantService.create_tenant_member(tenant, account, role=args.role)
        TenantService.switch_tenant(account, tenant.id)
        return {
            "result": "success",
            "data": {
                "account_id": account.id,
                "email": account.email,
                "name": account.name,
                "tenant_id": tenant.id,
                "role": args.role,
            },
        }

# 初始化管理员账户
@console_ns.route("/_jk_init_admin")
class InitAdminApi(Resource):
    """Resource for tenant creation."""
    def get(self):
        """Create a new tenant."""
        # 检查当前 TenantService 是否已经存在管理员账户
        email="admin@admin.com"
        name="admin"
        account = AccountService.get_account_by_email_with_case_fallback(email)
        if account is None:
            RegisterService.setup(
                email=email,
                name=name,
                password="Admin2026.",
                ip_address="127.0.0.1",
                language="zh-Hans",
            )
            account = AccountService.get_account_by_email_with_case_fallback(email)
            # 激活账户
            account.interface_theme = "light"
            account.status = AccountStatus.ACTIVE
            account.initialized_at = naive_utc_now()
            AccountService.update_account(account)
        account = AccountService.load_user(account.id)
        if account is None:
            raise AccountNotFound()

        tenant = TenantService.get_current_tenant_by_account(account)
        return {"result": "success", "data":  {
            "id": account.id,
            "email": account.email,
            "name": account.name,
            "tenant_id": tenant.id if tenant is not None else None,
           }}


@console_ns.route("/_jk_status_update")
class StatusUpdateApi(Resource):
    """Resource for updating account status."""

    @setup_required
    @console_ns.expect(console_ns.models[JkStatusUpdatePayload.__name__])
    def post(self):
        """Update account status."""
        args = JkStatusUpdatePayload.model_validate(console_ns.payload)
        new_status = JK_STATUS_MAP[args.status]

        account = db.session.get(Account, args.user_id)
        if account is None:
            raise AccountNotFound()

        account.status = new_status
        if new_status == AccountStatus.ACTIVE and account.initialized_at is None:
            account.initialized_at = naive_utc_now()
        AccountService.update_account(account)

        return {
            "result": "success",
            "data": {
                "user_id": account.id,
                "status": account.status,
            },
        }