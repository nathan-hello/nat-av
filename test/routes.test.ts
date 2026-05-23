import * as assert from "remix/assert";
import { describe, it } from "remix/test";

import { router } from "../app/router.ts";
import { routes } from "../app/routes.ts";

describe("app routes", () => {
  it("renders the home page", async () => {
    let response = await router.fetch(
      new Request("http://localhost" + routes.home.href()),
    );

    assert.equal(response.status, 200);
    assert.match(await response.text(), /Decoder Control/);
  });

  it("renders the debug page shell", async () => {
    let response = await router.fetch(
      new Request("http://localhost" + routes.debug.href()),
    );

    assert.equal(response.status, 200);
    assert.match(await response.text(), /Natav debug console/);
  });
});
