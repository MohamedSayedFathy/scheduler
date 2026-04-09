"""FastAPI application entry point for the scheduling engine."""

import sentry_sdk
import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.routes import router
from src.config import settings

# Initialize Sentry
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if settings.log_level == "debug" else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        settings.log_level.upper()
    ),
)

logger = structlog.get_logger()

app = FastAPI(
    title="Scheduler Engine",
    description="University timetabling optimization engine powered by Google OR-Tools CP-SAT",
    version="0.1.0",
    docs_url="/docs" if settings.log_level == "debug" else None,
    redoc_url=None,
)

# CORS — in production, restrict to the web app's origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.error("validation_error", errors=exc.errors(), body_snippet=str(exc.body)[:500] if exc.body else None)
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.on_event("startup")
async def startup() -> None:
    logger.info("engine_starting", port=settings.port)


@app.on_event("shutdown")
async def shutdown() -> None:
    logger.info("engine_shutting_down")
