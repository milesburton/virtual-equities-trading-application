import { DashboardLayout, DashboardProvider } from "./components/DashboardLayout.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { TradingProvider } from "./context/TradingContext.tsx";

export default function App() {
  return (
    <TradingProvider>
      <DashboardProvider>
        <div className="flex flex-col h-screen bg-gray-950 text-gray-100 overflow-hidden">
          <StatusBar />
          <div className="flex-1 overflow-auto">
            <DashboardLayout />
          </div>
        </div>
      </DashboardProvider>
    </TradingProvider>
  );
}
