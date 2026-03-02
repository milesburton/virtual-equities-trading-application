import { render, screen } from "@testing-library/react";
import type { ServiceHealth } from "../../hooks/useServiceHealth";
import { StatusBar } from "../StatusBar";

const services: ServiceHealth[] = [
  { name: "x", state: "ok", version: "1", meta: {}, lastChecked: null, url: "" },
];

test("shows LIVE when connected and shows time", () => {
  render(<StatusBar connected={true} services={services} />);
  expect(screen.getByText(/Market Feed LIVE/)).toBeInTheDocument();
  expect(screen.getByText(/Equities Market Emulator/)).toBeInTheDocument();
  // time element should exist
  expect(screen.getByText(/:/)).toBeInTheDocument();
});

test("shows DISCONNECTED when not connected", () => {
  render(<StatusBar connected={false} services={services} />);
  expect(screen.getByText(/DISCONNECTED/)).toBeInTheDocument();
});
