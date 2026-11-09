import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { signServiceRequest } from "./analytics";

describe("service signature contract (Node ↔ Python)", () => {
  it("Python verifies a signature produced by Node", () => {
    const secret = "s".repeat(40);
    const body = JSON.stringify({ total_cents: "10000", installments: 3 });
    const sig = signServiceRequest(secret, "1700000000", "abcdef0123456789", "u", "w", body);
    const py = execFileSync("uv", ["run", "-q", "python", "-c",
      "import sys; sys.path.insert(0,'.'); from rumo_analytics.security import sign; print(sign(*sys.argv[1:6], sys.argv[6].encode()))",
      secret, "1700000000", "abcdef0123456789", "u", "w", body], { cwd: "../analytics" }).toString().trim();
    expect(py).toBe(sig);
  });
});
