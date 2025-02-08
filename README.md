# 🚀 Equities Market Emulator

Welcome to the **Equities Market Emulator**! 📈 This project simulates a trading environment with an **Order Management System (OMS)**, **Execution Management System (EMS)**, a **Market Simulator**, and multiple **Algo Trading Strategies**.

## 🎯 Features
✅ **Realistic market simulation** for equities trading  
✅ **Order & Execution Management Systems for trade processing**  
✅ **Multiple Algo Trading Strategies** (Limit, TWAP, POV)  
✅ **Runs entirely in a Dev Container for easy setup**  
✅ **Configurable via `.env` file for dynamic port management**  
✅ **Supervisord for automatic service orchestration**  

## 📦 Project Structure
```
📂 backend/
 ├── 📂 src/
 │   ├── 📂 market-sim/        # Market Simulation Service
 │   ├── 📂 ems/               # Execution Management System (EMS)
 │   ├── 📂 oms/               # Order Management System (OMS)
 │   ├── 📂 algo/              # Algo Trading Strategies
 │   │   ├── limit-strategy.ts # Limit Order Algo Trader
 │   │   ├── twap-strategy.ts  # TWAP (Time-Weighted Average Price) Algo
 │   │   ├── pov-strategy.ts   # POV (Percentage of Volume) Algo
 │   ├── 📂 cli/               # CLI Tools (Trader - To be replaced with React & Tailwind)
 │   ├── 📂 db/                # Database (if needed)
 │   ├── 📂 tests/             # Unit & Integration Tests
 ├── .env                      # Environment Variables
 ├── .env.template             # Template for Environment Variables
 ├── supervisord.conf           # Process Manager Configuration
 ├── docker-compose.yml         # Optional Docker Compose Setup
📂 frontend/                     # UI Components (React & Tailwind - Coming Soon)
📂 .devcontainer/                 # Dev Container Configuration
```

## 🚀 Getting Started

### 🛠 Prerequisites
- **Visual Studio Code with Dev Containers** 💻
- **Docker** (Required for Dev Containers) 🐳
- **Deno** (Automatically installed inside the Dev Container) 🦕

### 🏗 Setup & Run
1️⃣ **Clone the repository**:
   ```sh
   git clone https://github.com/your-repo/equities-market-emulator.git
   cd equities-market-emulator
   ```
2️⃣ **Open in Visual Studio Code & Start Dev Container**:
   - Open **Command Palette** (`Ctrl + Shift + P`)
   - Select **Dev Containers: Rebuild and Reopen in Container**
   - This will set up **all dependencies automatically**

3️⃣ **Update the `.env` file (if needed):**
   ```sh
   cp .env.template .env
   ```
   Example `.env`:
   ```ini
   MARKET_SIM_PORT=5000
   EMS_PORT=5001
   OMS_PORT=5002
   LIMIT_ALGO_PORT=5003
   TWAP_ALGO_PORT=5004
   POV_ALGO_PORT=5005
   ```

4️⃣ **Run services automatically (via Supervisord)**
   ```sh
   supervisorctl status
   ```

### ℹ️ **Using the Dev Container?**
If you are using the **Dev Container**, all processes start automatically. **You do not need to start them manually**. Only the **Trader CLI** (which will be replaced with a React & Tailwind UI) needs to be launched manually.

#### **Available Aliases:**
```sh
  - run-market-sim: Runs the Market Simulation.
  - run-trader-cli: Runs the Trading CLI (Temporary - Will be replaced with React UI).
  - run-ems: Starts the Execution Management System (EMS).
  - run-oms: Starts the Order Management System (OMS).
  - run-limit-strategy: Starts the Limit Order Algo Trader.
  - run-twap-strategy: Starts the TWAP Algo Trader.
  - run-pov-strategy: Starts the POV Algo Trader.
```

## 🎮 Using the Trading CLI (`trader-cli`)
The `trader-cli` tool allows you to place simulated trades and select different algo strategies. **This will soon be replaced with a React UI built with Tailwind.**

1️⃣ **Run the trader CLI**:
   ```sh
   run-trader-cli
   ```
2️⃣ **Follow the prompts to enter trade details**, such as:
   - Asset (e.g., AAPL)
   - Trade side (BUY/SELL)
   - Quantity
   - Limit price
   - Expiry time (in seconds)
   - **Choose an execution strategy**: `Limit Order`, `TWAP`, or `POV`

3️⃣ **The order is sent to the corresponding algo or OMS**, and you will see a response with the trade status.

## 🔥 Services Overview
| **Service**       | **Port**  | **Description** |
|-------------------|----------|----------------|
| Market Sim       | `5000`   | Simulates market price movements |
| Execution (EMS)  | `5001`   | Manages trade execution |
| Order (OMS)      | `5002`   | Processes & stores orders |
| Limit Order Algo | `5003`   | Executes limit orders when conditions are met |
| TWAP Algo        | `5004`   | Executes trades evenly over time |
| POV Algo         | `5005`   | Executes a percentage of market volume |

## 🛠 Managing Services
### 🔄 Restart a service manually:
```sh
supervisorctl restart <service-name>
```
Example:
```sh
supervisorctl restart market-sim
```

### 🔍 Check logs
```sh
supervisorctl tail -f <service-name>
```
Example:
```sh
supervisorctl tail -f oms
```

## 📜 Licence
MIT Licence © 2025 Miles Burton

🚀 **Happy Trading!** 📈🔥
