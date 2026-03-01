FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    bash \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash deno

USER deno
WORKDIR /home/deno

RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV DENO_INSTALL="/home/deno/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

WORKDIR /app

COPY --chown=deno:deno . .

RUN cd frontend && /home/deno/.deno/bin/deno install --allow-scripts
