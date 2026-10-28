import { describe, expect, it } from "vitest";
import { createApp, createRouter, toWebHandler } from "h3";
import statusHandler from "../runtime/server/routes/status.get";
import {
  MAPO_AI_CONTRACT_VERSION,
  MAPO_AI_GATEWAY_PATH,
} from "../runtime/shared/gateway";

const statusPath = `${MAPO_AI_GATEWAY_PATH}/status`;

/** The status route mounted on a bare h3 app, as Nitro mounts it. */
function gateway(): (request: Request) => Promise<Response> {
  const router = createRouter().get(statusPath, statusHandler);
  return toWebHandler(createApp().use(router));
}

describe("GET /_mapo/ai/status", () => {
  it("answers with the contract version only", async () => {
    const response = await gateway()(
      new Request(`http://localhost${statusPath}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      contract: MAPO_AI_CONTRACT_VERSION,
    });
  });

  it("gives an anonymous caller the same answer as a signed-in one", async () => {
    const handle = gateway();
    const anonymous = await handle(
      new Request(`http://localhost${statusPath}`),
    );
    const withCookie = await handle(
      new Request(`http://localhost${statusPath}`, {
        headers: { cookie: "__mapo_session=abc" },
      }),
    );

    expect(await withCookie.json()).toEqual(await anonymous.json());
  });
});
