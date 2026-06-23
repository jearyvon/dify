import logging

from flask import request
from flask_restx import Resource
from pydantic import BaseModel, Field
from sqlalchemy import select
from werkzeug.exceptions import NotFound

from controllers.common.schema import query_params_from_model, register_schema_models
from controllers.console import console_ns
from extensions.ext_database import db
from models.model import Site

logger = logging.getLogger(__name__)


class JkAppPublishPayload(BaseModel):
    app_id: str = Field(description="App ID")
    marked_name: str | None = Field(default=None, max_length=20)
    marked_comment: str | None = Field(default=None, max_length=100)


class JkAppCodeQuery(BaseModel):
    app_id: str = Field(description="App ID")


register_schema_models(
    console_ns,
    JkAppPublishPayload,
    JkAppCodeQuery,
)


@console_ns.route("/_jk_app_code")
class AppCodeApi(Resource):
    """Resource for getting site code by app id."""

    @console_ns.doc(params=query_params_from_model(JkAppCodeQuery))
    def get(self):
        """Get site code by app id."""
        args = JkAppCodeQuery.model_validate(request.args.to_dict(flat=True))
        site = db.session.scalar(select(Site).where(Site.app_id == args.app_id).limit(1))
        if site is None:
            raise NotFound(f"Site for app {args.app_id} not found")
        return {
            "result": "success",
            "data": {
                "code": site.code,
            },
        }
