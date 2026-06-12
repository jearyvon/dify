
import json
import logging
# from collections.abc import Sequence
# from datetime import datetime
# from typing import Any, NotRequired, TypedDict

# from flask import abort, request
# from flask_restx import Resource, fields
from pydantic import AliasChoices, BaseModel, Field, ValidationError, field_validator
# from sqlalchemy.orm import sessionmaker
# from werkzeug.exceptions import BadRequest, Forbidden, InternalServerError, NotFound

# from controllers.console import console_ns
# from controllers.console.app.error import ConversationCompletedError, DraftWorkflowNotExist, DraftWorkflowNotSync
# from controllers.console.app.wraps import get_app_model
# from controllers.console.wraps import account_initialization_required, edit_permission_required, setup_required
from controllers.web.error import InvokeRateLimitError as InvokeRateLimitHttpError
from core.app.app_config.features.file_upload.manager import FileUploadConfigManager
from core.app.apps.base_app_queue_manager import AppQueueManager
from core.app.apps.workflow.app_generator import SKIP_PREPARE_USER_INPUTS_KEY
from core.app.entities.app_invoke_entities import InvokeFrom
from core.app.file_access import DatabaseFileAccessController
from core.helper import encrypter
from core.helper.trace_id_helper import get_external_trace_id
from core.plugin.impl.exc import PluginInvokeError
from core.trigger.constants import TRIGGER_SCHEDULE_NODE_TYPE
# from core.trigger.debug.event_selectors import (
#     TriggerDebugEvent,
#     TriggerDebugEventPoller,
#     create_event_poller,
#     select_trigger_debug_events,
# )
from extensions.ext_database import db
from extensions.ext_redis import redis_client
from factories import file_factory, variable_factory
from fields.base import ResponseModel
from fields.member_fields import SimpleAccount
from fields.workflow_run_fields import WorkflowRunNodeExecutionResponse
from graphon.enums import NodeType
from graphon.file import File
from graphon.file import helpers as file_helpers
from graphon.graph_engine.manager import GraphEngineManager
from graphon.model_runtime.utils.encoders import jsonable_encoder
from graphon.variables import SecretVariable, SegmentType, VariableBase
from libs import helper
from libs.datetime_utils import naive_utc_now
from libs.helper import TimestampField, dump_response, to_timestamp, uuid_value
from libs.login import current_account_with_tenant, login_required
from models import App
from models.model import AppMode
from models.workflow import Workflow
from repositories.workflow_collaboration_repository import WORKFLOW_ONLINE_USERS_PREFIX
from services.app_generate_service import AppGenerateService
from services.errors.app import IsDraftWorkflowError, WorkflowHashNotEqualError, WorkflowNotFoundError
from services.errors.llm import InvokeRateLimitError
from services.workflow_service import DraftWorkflowDeletionError, WorkflowInUseError, WorkflowService

logger = logging.getLogger(__name__)

_file_access_controller = DatabaseFileAccessController()
LISTENING_RETRY_IN = 2000

RESTORE_SOURCE_WORKFLOW_MUST_BE_PUBLISHED_MESSAGE = "source workflow must be published"
MAX_WORKFLOW_ONLINE_USERS_REQUEST_IDS = 1000
WORKFLOW_ONLINE_USERS_REDIS_BATCH_SIZE = 50
ENVIRONMENT_VARIABLE_SUPPORTED_TYPES = (SegmentType.STRING, SegmentType.NUMBER, SegmentType.SECRET)

class JkAppPublishPayload(BaseModel):
    app_id: str = Field(description="App ID")
    marked_name: str | None = Field(default=None, max_length=20)
    marked_comment: str | None = Field(default=None, max_length=100)
