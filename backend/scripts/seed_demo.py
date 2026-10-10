from __future__ import annotations

import asyncio

from app.db.base import Base
from app.db.session import engine


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database schema initialized")


if __name__ == "__main__":
    asyncio.run(main())
