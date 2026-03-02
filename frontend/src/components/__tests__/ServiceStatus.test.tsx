import { fireEvent, render, screen } from "@testing-library/react";
import type { ServiceHealth } from "../../types";
import { ServiceStatus } from "../ServiceStatus";

const services: ServiceHealth[] = [
  {
    name: "market-sim",
    state: "ok",
    version: "1.2.3",
    meta: {},
    lastChecked: Date.now(),
    url: "",
  },
  {
    name: "ems",
    state: "unknown",
    version: "0.1.0",
    meta: { region: "us" },
    lastChecked: null,
    url: "",
  },
];

test("renders aggregate dot and opens panel with service rows", () => {
  render(<ServiceStatus services={services} />);

  // Button exists
  const btn = screen.getByRole("button", { name: /services/i });
  expect(btn).toBeInTheDocument();

  // Click to open panel
  fireEvent.click(btn);

  // Expect service names to be visible
  expect(screen.getByText("market-sim")).toBeInTheDocument();
  expect(screen.getByText("ems")).toBeInTheDocument();

  // Version string present
  expect(screen.getByText("1.2.3")).toBeInTheDocument();
});
