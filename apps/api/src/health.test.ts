import { type ServerType, serve } from "@hono/node-server";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("GET /health", () => {
  let server: ServerType | undefined;

  afterAll(async () => {
    const running = server;
    if (running === undefined) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      running.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("returns ok", async () => {
    const port = await new Promise<number>((resolve, reject) => {
      try {
        server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 }, (info) => {
          resolve(info.port);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("failed to listen"));
      }
    });

    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });
});
