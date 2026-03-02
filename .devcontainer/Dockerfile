# Use Ubuntu as base image
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
    ssh \
    sudo \
    supervisor \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxss1 \
    libxcomposite1 \
    libxrandr2 \
    libgtk-3-0 \
    libxcb1 \
    libx11-xcb1 \
    && gem install lolcat \
    && pip3 install --no-cache-dir --upgrade "git+https://github.com/openai/whisper.git@v20231117" \
    && pip install --no-cache-dir --upgrade yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 LTS (for frontend tooling & Playwright)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* || true

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/* || true

# Create a new user named 'deno' with Fish as the default shell
RUN useradd -m -s /usr/bin/fish deno

# Ensure the .ssh directory exists and has the correct permissions
RUN mkdir -p /home/deno/.ssh && \
    chown -R deno:deno /home/deno/.ssh && \
    chmod 700 /home/deno/.ssh

# Switch to the 'deno' user
USER deno

# Set the working directory
WORKDIR /home/deno

# Ensure the Fish configuration directory exists
RUN mkdir -p /home/deno/.config/fish

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh

# Copy the supervisord configuration
COPY supervisord.conf /home/deno/supervisord.conf

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
    echo '  echo "💡 If you are using the Dev Container, all services start automatically."' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "💡 Open http://localhost:8080 to access the trading UI."' >> /home/deno/.config/fish/config.fish && \
    echo '  echo ""' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "Available aliases:" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-frontend: Starts the React trading UI (http://localhost:8080)." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-market-sim: Runs the Market Simulation." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-trader-cli: Runs the Trading CLI." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-ems: Starts the Execution Management System (EMS)." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-oms: Starts the Order Management System (OMS)." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-limit-strategy: Starts the Limit Order Algo Trader." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-twap-strategy: Starts the TWAP Algo Trader." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-pov-strategy: Starts the POV Algo Trader." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - run-vwap-strategy: Starts the VWAP Algo Trader." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "  - restart-services: Restart all backend services via supervisord." | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo '  echo "-------------------------------------------------" | lolcat' >> /home/deno/.config/fish/config.fish && \
    echo 'end' >> /home/deno/.config/fish/config.fish && \
    echo '' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-frontend="cd /workspaces/virtual-equities-trading-application/frontend && deno task dev"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-market-sim="deno run --allow-all backend/src/market-sim/market-sim.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-trader-cli="deno run --allow-all backend/src/cli/trader.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-ems="deno run --allow-all backend/src/ems/ems-server.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-oms="deno run --allow-all backend/src/oms/oms-server.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-limit-strategy="deno run --allow-all backend/src/algo/limit-strategy.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-twap-strategy="deno run --allow-all backend/src/algo/twap-strategy.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-pov-strategy="deno run --allow-all backend/src/algo/pov-strategy.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias run-vwap-strategy="deno run --allow-all backend/src/algo/vwap-strategy.ts"' >> /home/deno/.config/fish/config.fish && \
    echo 'alias restart-services="supervisorctl -c /home/deno/supervisord.conf restart market-sim ems oms algo-trader twap-algo pov-algo vwap-algo && supervisorctl -c /home/deno/supervisord.conf status"' >> /home/deno/.config/fish/config.fish

# Ensure supervisord runs
CMD ["/usr/bin/supervisord", "-c", "/home/deno/supervisord.conf"]

# Set Fish as the default shell
SHELL ["/usr/bin/fish", "-c"]
