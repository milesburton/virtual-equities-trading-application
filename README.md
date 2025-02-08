🚀 Equities Market Emulator

Welcome to the Equities Market Emulator! 📈 This project simulates a trading environment with an Order Management System (OMS), Execution Management System (EMS), a Market Simulator, and an Algo Trader.

🎯 Features

✅ Realistic market simulation for equities trading✅ Order & Execution Management Systems for processing trades✅ Algo Trading with limit order strategy✅ Runs entirely in a Dev Container for easy setup✅ Configurable via .env file for dynamic port management✅ Supervisord for automatic service orchestration

📦 Project Structure

📂 backend/
 ├── 📂 src/
 │   ├── 📂 market-sim/        # Market Simulation Service
 │   ├── 📂 ems/               # Execution Management System (EMS)
 │   ├── 📂 oms/               # Order Management System (OMS)
 │   ├── 📂 algo/              # Algo Trading Strategies
 │   ├── 📂 cli/               # CLI Tools (Trader)
 │   ├── 📂 db/                # Database (if needed)
 │   ├── 📂 tests/             # Unit & Integration Tests
 ├── .env                      # Environment Variables
 ├── .env.template             # Template for Environment Variables
 ├── supervisord.conf           # Process Manager Configuration
 ├── docker-compose.yml         # Optional Docker Compose Setup
📂 frontend/                     # UI Components (Future)
📂 .devcontainer/                 # Dev Container Configuration

🚀 Getting Started

🛠 Prerequisites

Visual Studio Code with Dev Containers 💻

Docker (Required for Dev Containers) 🐳

Deno (Automatically installed inside the Dev Container) 🦕

🏗 Setup & Run

1️⃣ Clone the repository:

git clone https://github.com/your-repo/equities-market-emulator.git
cd equities-market-emulator

2️⃣ Open in Visual Studio Code & Start Dev Container:

Open Command Palette (Ctrl + Shift + P)

Select Dev Containers: Rebuild and Reopen in Container

This will set up all dependencies automatically

3️⃣ Update the .env file (if needed):

cp .env.template .env

Example .env:

MARKET_SIM_PORT=5000
EMS_PORT=5001
OMS_PORT=5002
ALGO_TRADER_PORT=5003

4️⃣ Run services automatically (via Supervisord)

supervisorctl status

🎮 Using the Trading CLI (trader-cli)

The trader-cli tool allows you to place simulated trades. To use it:

1️⃣ Run the trader CLI:

run-trader-cli

2️⃣ Follow the prompts to enter trade details, such as:

Asset (e.g., AAPL)

Trade side (BUY/SELL)

Quantity

Limit price

Expiry time (in seconds)

3️⃣ The order is sent to the OMS, and you will see a response with the trade status.

🔥 Services Overview

Service

Port

Description

Market Sim

5000

Simulates market price movements

Execution (EMS)

5001

Manages trade execution

Order (OMS)

5002

Processes & stores orders

Algo Trader

5003

Places trades automatically

🛠 Managing Services

🔄 Restart a service manually:

supervisorctl restart <service-name>

Example:

supervisorctl restart market-sim

🔍 Check logs

supervisorctl tail -f <service-name>

Example:

supervisorctl tail -f oms

📜 Licence

MIT Licence © 2025 Miles Burton

🚀 Happy Trading! 📈🔥