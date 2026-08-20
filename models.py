"""
Pydantic models — request/response schemas for the ProductIQ API.
"""
from pydantic import BaseModel, Field
from typing import Optional, Any


class FieldMeta(BaseModel):
    source: str = Field(description="'extracted' or 'inferred'")
    confidence: int = 0
    evidence: str = ""


class ValidationFlag(BaseModel):
    level: str  # "warning" | "ok"
    msg: str


class ProductData(BaseModel):
    product_name: Any = "unknown"
    category: Any = "unknown"
    brand: Any = "unknown"
    description: Any = "unknown"
    key_specifications: Any = {}
    materials: Any = []
    dimensions: Any = "unknown"
    weight: Any = "unknown"
    certifications: Any = []
    use_cases: Any = []
    compatible_with: Any = []
    power_requirements: Any = "unknown"


class ExtractResponse(BaseModel):
    data: dict
    meta: dict
    flags: dict
    quality_score: int
    sources_used: list[str] = []


class BatchItem(BaseModel):
    label: str
    data: dict
    meta: dict
    flags: dict
    quality_score: int
    error: Optional[str] = None


class BatchResponse(BaseModel):
    items: list[BatchItem]


class UrlListRequest(BaseModel):
    urls: list[str] = []
    text: str = ""


class BatchRequest(BaseModel):
    lines: list[str]