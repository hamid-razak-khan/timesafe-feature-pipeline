"""API package for TimeSafe Feature Pipeline."""
from fastapi import APIRouter
from backend.api.ingestion import router as ingestion_router
from backend.api.pipeline import router as pipeline_router
from backend.api.features import router as features_router
from backend.api.reports import router as reports_router
from backend.api.history import router as history_router

api_router = APIRouter()
api_router.include_router(ingestion_router, tags=["Ingestion & Data Generation"])
api_router.include_router(pipeline_router, tags=["Pipeline Execution"])
api_router.include_router(features_router, tags=["Features & Preview"])
api_router.include_router(reports_router, tags=["Reports & Observability"])
api_router.include_router(history_router, tags=["Dashboard, History & Reprocessing"])

__all__ = ["api_router"]

