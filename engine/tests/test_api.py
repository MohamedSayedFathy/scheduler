"""Tests for the FastAPI endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


class TestHealthEndpoint:
    async def test_health_returns_ok(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "or_tools_version" in data

    async def test_health_has_correct_content_type(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert "application/json" in response.headers["content-type"]


class TestSolveEndpoint:
    async def test_solve_rejects_empty_body(self, client: AsyncClient) -> None:
        response = await client.post("/solve", json={})
        assert response.status_code == 422  # Pydantic validation error

    async def test_solve_rejects_invalid_rooms(self, client: AsyncClient) -> None:
        response = await client.post(
            "/solve",
            json={
                "tenantId": "not-a-uuid",
                "scheduleId": "not-a-uuid",
                "callbackUrl": "not-a-url",
                "rooms": [],
                "timeSlots": [],
                "lecturers": [],
                "studentGroups": [],
                "sessions": [],
            },
        )
        assert response.status_code == 422
