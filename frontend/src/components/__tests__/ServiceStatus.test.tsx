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

  // Version string present (in table)
  expect(screen.getByText("1.2.3")).toBeInTheDocument();
});

test("shows ok/total count in the Services button", () => {
  render(<ServiceStatus services={services} />);
  const btn = screen.getByRole("button", { name: /services/i });
  // 1 ok out of 2 required (neither is optional)
  expect(btn.textContent).toMatch(/1\/2/);
});

test("shows version in button when all required services have consistent version", () => {
  const allOk: ServiceHealth[] = [
    { name: "svc-a", state: "ok", version: "9.9.9", meta: {}, lastChecked: Date.now(), url: "" },
    { name: "svc-b", state: "ok", version: "9.9.9", meta: {}, lastChecked: Date.now(), url: "" },
  ];
  render(<ServiceStatus services={allOk} />);
  const btn = screen.getByRole("button", { name: /services/i });
  expect(btn.textContent).toContain("v9.9.9");
});
