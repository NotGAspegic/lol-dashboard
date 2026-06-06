from __future__ import annotations

import importlib
import logging
from contextlib import asynccontextmanager
from typing import Any, Type

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

Instrumentator: Type[Any] | None = None
try:
    from prometheus_fastapi_instrumentator import Instrumentator
except ImportError:  # pragma: no cover - local dev can run without metrics installed
    Instrumentator = None

api_v1_module: Any
config_module: Any
database_module: Any

try:
    package_name = __package__ or "backend"
    api_v1_module = importlib.import_module(".api.v1", package=package_name)
    config_module = importlib.import_module(".config", package=package_name)
    database_module = importlib.import_module(".database", package=package_name)
except ImportError:
    api_v1_module = importlib.import_module("api.v1")
    config_module = importlib.import_module("config")
    database_module = importlib.import_module("database")

v1_router = api_v1_module.router
settings = config_module.settings
engine = database_module.engine
test_connection = database_module.test_connection


logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(levelname)s %(name)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize shared clients on startup and close them on shutdown."""
    logger.info("API startup: initializing database and Redis connections")

    await test_connection()
    app.state.db_ready = True
    logger.info("Database connection pool is ready")

    redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    await redis_client.ping()
    app.state.redis = redis_client
    app.state.redis_ready = True
    logger.info("Redis connection is ready")

    try:
        yield
    finally:
        logger.info("API shutdown: closing Redis and database engine")

        redis_conn = getattr(app.state, "redis", None)
        if redis_conn is not None:
            await redis_conn.aclose()
            app.state.redis_ready = False
            logger.info("Redis connection closed")

        await engine.dispose()
        app.state.db_ready = False
        logger.info("Database engine disposed")


app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
    lifespan=lifespan,
)

if Instrumentator is not None:
    Instrumentator().instrument(app).expose(app)
else:
    logger.warning("prometheus_fastapi_instrumentator is not installed; /metrics is disabled")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix=settings.api_v1_prefix)


@app.get("/")
async def root() -> dict[str, str]:
    """Basic API entrypoint for quick sanity checks."""
    return {"message": f"{settings.app_name} API is running"}


@app.get("/health")
async def health(request: Request) -> dict[str, Any]:
    """Compatibility health endpoint with active DB and Redis checks."""
    try:
        await test_connection()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database connection failed") from exc

    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is None:
        raise HTTPException(status_code=503, detail="redis client not initialized")

    try:
        redis_ok = await redis_client.ping()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="redis connection failed") from exc

    if not redis_ok:
        raise HTTPException(status_code=503, detail="redis ping failed")

    return {
        "status": "ok",
        "db": "connected",
        "redis": "connected",
    }
