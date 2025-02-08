import { assertEquals } from "https://deno.land/std@0.118.0/testing/asserts.ts";
import { generatePrice } from "../market-sim/fxSimulator.ts";

Deno.test("FX price generator should return a number", () => {
    const price = generatePrice("GBP/USD");
    assertEquals(typeof price, "number");
});
