FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    fish \
    git \
    python3 \
    python3-pip \
    sqlite3 \
    shellcheck \
    ruby \
    tree \
    && gem install lolcat \
    && pip3 install --no-cache-dir --upgrade "git+https://github.com/openai/whisper.git@v20231117" \
    && pip install --no-cache-dir --upgrade yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Create a new user named 'deno' with Fish as the default shell
RUN useradd -m -s /usr/bin/fish deno

# Switch to the 'deno' user
USER deno

# Set the working directory
WORKDIR /home/deno

# Ensure the Fish configuration directory exists
RUN mkdir -p /home/deno/.config/fish

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

# Update Fish config with Deno paths, welcome message, and aliases
RUN echo '# Deno setup' > /home/deno/.config/fish/config.fish && \
    echo 'set -gx DENO_INSTALL "$HOME/.deno"' >> /home/deno/.config/fish/config.fish && \
    echo 'fish_add_path $DENO_INSTALL/bin' >> /home/deno/.config/fish/config.fish && \
    echo '' >> /home/deno/.config/fish/config.fish && \
    echo 'if status is-interactive' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "Welcome to the Equities Market Emulator Dev Container!" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "Available aliases:" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-market-sim: Runs the Market Simulation." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-trader-cli: Runs the Trading CLI with defaults." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - connect-ws: Connects to the WebSocket server." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-ems: Starts the Execution Management System (EMS)." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-oms: Starts the Order Management System (OMS)." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-limit-strategy: Starts the Limit Order Algo Trader." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To start the market simulation, type: run-market-sim" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To start the trading CLI, type: run-trader-cli" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To connect to the WebSocket server, type: connect-ws" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To start the EMS, type: run-ems" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To start the OMS, type: run-oms" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "To start the Limit Order Algo Trader, type: run-limit-strategy" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo 'end' >> /home/deno/.config/fish/config.fish && \
    echo '' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-market-sim="deno run --allow-net backend/src/market-sim/market-sim.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-trader-cli="deno run --allow-net --allow-run --allow-read --allow-write --allow-env --allow-ffi backend/src/cli/trader.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias connect-ws="deno run --allow-net npm:wscat -c ws://localhost:8080"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-ems="deno run --allow-net backend/src/ems/ems-server.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-oms="deno run --allow-net backend/src/oms/oms-server.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-limit-strategy="deno run --allow-net backend/src/algo/limit-strategy.ts"' >> /home/deno/.config/fish/config.fish

# Set Fish as the default shell
SHELL ["/usr/bin/fish", "-c"]

# Verify Deno installation
RUN deno --version
