FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git libssl-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /tmp
RUN git clone --depth 1 https://github.com/open-quantum-safe/liboqs.git && \
    cd liboqs && mkdir build && cd build && \
    cmake -DOQS_BUILD_ONLY_LIB=ON -DCMAKE_INSTALL_PREFIX=/usr/local .. && \
    make -j"$(nproc)" && make install && ldconfig && \
    rm -rf /tmp/liboqs

# Tell liboqs-python where the pre-built library lives so it links
# against it at pip-install time instead of triggering a cmake build
# on the first Python import at runtime.
ENV LIBOQS_INSTALL_PREFIX=/usr/local \
    LD_LIBRARY_PATH=/usr/local/lib:${LD_LIBRARY_PATH}

WORKDIR /app
COPY pyproject.toml README.md ./

# pip install is slow — keep it as its own cached layer.
# Changes to app code below will NOT bust this cache.
RUN pip install --upgrade pip && pip install . && \
    # Pre-warm: import oqs NOW (at image build) so the shared-library
    # linkage is verified and cached — never triggers at request time.
    python -c "import oqs; print('liboqs version:', oqs.oqs_version())"

# App code — changes here only invalidate the fast COPY layers below.
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
