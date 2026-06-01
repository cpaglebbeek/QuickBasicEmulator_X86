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

RUN useradd -m -u 1000 builder
WORKDIR /opt
RUN git clone --depth 1 https://github.com/QB64-Phoenix-Edition/QB64pe.git qb64pe \
    && chown -R builder:builder /opt/qb64pe
USER builder
WORKDIR /opt/qb64pe

# Build QB64-PE compiler. setup_lnx.sh refuses root → use non-root builder.
RUN ./setup_lnx.sh quiet
RUN test -x ./qb64pe || (echo "QB64-PE build failed" && exit 1)
USER root

# Slim runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev libcurl4-openssl-dev libfreetype-dev libfontconfig1-dev \
    libgl1-mesa-dev libglu1-mesa-dev libglew-dev libglut-dev \
    libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev \
    xvfb x11vnc websockify procps \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 -s /bin/bash qbe \
    && mkdir -p /work && chown qbe:qbe /work

COPY --from=build /opt/qb64pe /opt/qb64pe

RUN chown -R qbe:qbe /opt/qb64pe

COPY --chown=qbe:qbe entrypoint.sh /usr/local/bin/qbe-compile
RUN chmod +x /usr/local/bin/qbe-compile

USER qbe
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/qbe-compile"]
CMD []
