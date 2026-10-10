from __future__ import annotations

from fastapi import HTTPException


class AppError(HTTPException):
    def __init__(self, status_code: int, title: str, detail: str, type_: str = "about:blank") -> None:
        super().__init__(status_code=status_code, detail=detail)
        self.problem = {"type": type_, "title": title, "status": status_code, "detail": detail}


def problem(status_code: int, title: str, detail: str, type_: str = "about:blank") -> AppError:
    return AppError(status_code=status_code, title=title, detail=detail, type_=type_)
