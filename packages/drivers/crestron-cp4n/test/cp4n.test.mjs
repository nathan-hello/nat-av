import assert from "node:assert/strict";
import test from "node:test";
import Cp4nDriver from "../.dist/index.js";

function processor({ xsrf = true, status = 0 } = {}) {
  const requests = [];
  const driver = new Cp4nDriver(
    "cp4n",
    {
      host: "cp4n.test",
      httpsPort: 443,
      username: "admin",
      password: "test",
      allowSelfSigned: false,
    },
    () => ({
      close() {},
      async fetch(url, init = {}) {
        const path = new URL(url).pathname;
        requests.push({
          path,
          method: init.method ?? "GET",
          headers: new Headers(init.headers),
          body: init.body,
        });
        const headers = new Headers();
        if (path === "/userlogin.html") {
          if (init.method === "POST") {
            headers.append("set-cookie", "userid=1");
            headers.append("set-cookie", "userstr=admin");
            if (xsrf) headers.set("CREST-XSRF-TOKEN", "token");
          }
          return new Response(null, { headers });
        }
        if (path === "/logout") return new Response(null);
        if (init.method === "POST")
          return Response.json({
            Actions: [{ Results: [{ StatusId: status }] }],
          });
        const name = path.split("/")[2];
        return Response.json({ Device: { [name]: { Version: "2.0.0" } } });
      },
    }),
  );
  return { driver, requests };
}

test("construction performs no I/O; reads require an explicit connection", async () => {
  const { driver, requests } = processor();
  await assert.rejects(driver.api.programs(), /Authenticate HTTPS first/);
  assert.equal(requests.length, 0);
});

test("reads any CresNext object and returns the native response", async () => {
  const { driver, requests } = processor();
  await driver.api.connect();
  assert.deepEqual(await driver.api.read("Programs"), {
    Device: { Programs: { Version: "2.0.0" } },
  });
  assert.deepEqual(await driver.api.router(), {
    Device: { Router: { Version: "2.0.0" } },
  });
  assert.equal(requests.at(-1).path, "/Device/Router/");
  await assert.rejects(driver.api.read("../etc"), /CresNext object name/);
  await driver.api.disconnect();
  assert.equal(driver.authenticated, false);
});

test("writes send the XSRF token, refuse empty patches and check action results", async () => {
  const { driver, requests } = processor();
  await driver.api.connect();
  await driver.api.setRouter({ IsIsolationModeEnabled: false });
  const write = requests.at(-1);
  assert.equal(write.path, "/Device");
  assert.equal(write.headers.get("X-CREST-XSRF-TOKEN"), "token");
  assert.deepEqual(JSON.parse(write.body), {
    Device: { Router: { IsIsolationModeEnabled: false } },
  });
  await assert.rejects(driver.api.set("Router", {}), /nonempty/);
  const rejected = processor({ status: 1 });
  await rejected.driver.api.connect();
  await assert.rejects(
    rejected.driver.api.set("Router", { A: 1 }),
    /rejected an API action/,
  );
});

test("login without an XSRF token is refused", async () => {
  const { driver } = processor({ xsrf: false });
  await assert.rejects(driver.api.connect(), /XSRF/);
  assert.equal(driver.authenticated, false);
});
