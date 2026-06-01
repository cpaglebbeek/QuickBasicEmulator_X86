# QB64-PE Compile Sandbox — Debian-slim base + QB64-PE built from source.
# v1.0.0-Kemeny F1 sandbox image. Tag: qbe-compiler:latest

FROM debian:bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates build-essential \
    libssl-dev libcurl4-openssl-dev \
    libfreetype-dev libfontconfig1-dev \
    libgl1-mesa-dev libglu1-mesa-dev \
    libglew-dev freeglut3-dev \
    libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth 1 https://github.com/QB64-Phoenix-Edition/QB64pe.git qb64pe
WORKDIR /opt/qb64pe

# Build QB64-PE compiler (console-only flavor, no GUI runtime needed for compile)
RUN ./setup_lnx.sh quiet || true
RUN test -x ./qb64pe || (echo "QB64-PE build failed" && exit 1)

# Slim runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 libcurl4 libfreetype6 libfontconfig1 \
    libgl1 libglu1-mesa libglew2.2 freeglut3 \
    libxrandr2 libxinerama1 libxcursor1 libxi6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash qbe \
    && mkdir -p /work && chown qbe:qbe /work

COPY --from=build /opt/qb64pe /opt/qb64pe

USER qbe
WORKDIR /work
ENTRYPOINT ["/opt/qb64pe/qb64pe"]
CMD ["--help"]
