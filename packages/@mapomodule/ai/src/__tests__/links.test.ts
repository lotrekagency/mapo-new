import { createServer } from "node:http";
import type { IncomingHttpHeaders, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync, deflateRawSync, gzipSync } from "node:zlib";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { linksAreOn, readSourceLink } from "../runtime/server/links/link";
import type { LinkDependencies } from "../runtime/server/links/link";
import {
  fetchPage,
  guardedLookup,
  isPublicAddress,
  MAX_REDIRECTS,
} from "../runtime/server/links/node";
import type { Resolve } from "../runtime/server/links/node";
import {
  hostPatternOf,
  isHopOpened,
  isOpened,
  linkRulesOf,
  pageNameOf,
  refusalOf,
} from "../runtime/server/links/rules";
import type {
  MapoAiFetcher,
  MapoAiFetchRequest,
} from "../runtime/server/links/types";
import { mapoAiReaders } from "../runtime/server/readers/registry";
import type { MapoAiReadContext } from "../runtime/server/readers/types";
import { readRunOptions } from "../runtime/server/run/options";
import type { MapoAiRunOptions } from "../runtime/server/run/options";

const rules = (allow: string[] = [], deny: string[] = []) =>
  linkRulesOf({ allow, deny });

describe("the rules of a link", () => {
  it("read the hosts an app writes, and nothing else", () => {
    expect(hostPatternOf("Example.ORG")).toEqual({
      host: "example.org",
      subdomains: false,
    });
    expect(hostPatternOf("*.intranet.example")).toEqual({
      host: "intranet.example",
      subdomains: true,
    });
    expect(hostPatternOf("localhost:3000")).toEqual({
      host: "localhost",
      subdomains: false,
      port: "3000",
    });
    expect(hostPatternOf("[::1]:8080")).toEqual({
      host: "[::1]",
      subdomains: false,
      port: "8080",
    });
    expect(hostPatternOf("localhost:80")).toEqual({
      host: "localhost",
      subdomains: false,
    });
    expect(hostPatternOf("*")).toEqual({ host: "*", subdomains: false });
    for (const entry of [
      "",
      "https://example.org",
      "example.org/path",
      "user@example.org",
      "*.*.example.org",
      "exa mple.org",
      "example.org:99999",
      "*.",
    ]) {
      expect(hostPatternOf(entry), entry).toBeUndefined();
    }
  });

  it("refuse what is no address of the web, a user or a password, a port the app does not open", () => {
    const none = rules();
    const refusal = (link: string) => refusalOf(new URL(link), none);

    expect(refusal("https://example.org/a?b=1")).toBeUndefined();
    expect(refusal("http://example.org:80/")).toBeUndefined();
    expect(refusal("https://example.org:443/")).toBeUndefined();
    expect(refusal("ftp://example.org/")).toBe("scheme");
    expect(refusal("file:///etc/passwd")).toBe("scheme");
    expect(refusal("javascript:alert(1)")).toBe("scheme");
    expect(refusal("data:text/html,hi")).toBe("scheme");
    expect(refusal("https://me@example.org/")).toBe("credentials");
    expect(refusal("https://me:secret@example.org/")).toBe("credentials");
    expect(refusal("https://example.org:8443/")).toBe("port");
    expect(refusal("http://example.org:22/")).toBe("port");
  });

  it("open a port only for the host that names it, and keep out the hosts of deny, which win", () => {
    const some = rules(
      ["localhost:3000", "wiki.intranet.example", "*.lab.example"],
      ["*.ads.example", "wiki.intranet.example"],
    );
    const refusal = (link: string) => refusalOf(new URL(link), some);

    expect(refusal("http://localhost:3000/a")).toBeUndefined();
    expect(refusal("http://other.example:3000/a")).toBe("port");
    expect(refusal("https://cdn.ads.example/")).toBe("denied");
    expect(refusal("https://ads.example/")).toBeUndefined();
    expect(refusal("https://wiki.intranet.example/")).toBe("denied");
    expect(refusalOf(new URL("https://example.org/"), rules([], ["*"]))).toBe(
      "denied",
    );

    expect(isOpened(new URL("http://localhost:3000/"), some)).toBe(true);
    expect(isOpened(new URL("http://localhost/"), some)).toBe(false);
    expect(isOpened(new URL("https://a.lab.example/"), some)).toBe(true);
    expect(isOpened(new URL("https://lab.example/"), some)).toBe(false);
  });

  it("read a host the same with the dots a fully qualified name ends with", () => {
    const some = rules(
      ["wiki.intranet.example."],
      ["evil.example", "*.ads.example."],
    );
    const refusal = (link: string) => refusalOf(new URL(link), some);

    expect(refusal("http://evil.example./")).toBe("denied");
    expect(refusal("http://evil.example%2e/")).toBe("denied");
    expect(refusal("https://cdn.ads.example../")).toBe("denied");
    expect(isOpened(new URL("https://wiki.intranet.example/"), some)).toBe(
      true,
    );
    expect(isOpened(new URL("https://wiki.intranet.example./"), some)).toBe(
      true,
    );
    expect(hostPatternOf(".")).toBeUndefined();
  });

  it("deny a host on the port it names, and on every port when it names none", () => {
    const some = rules(
      ["localhost:3000", "localhost:4000"],
      ["localhost:4000", "api.example"],
    );
    const refusal = (link: string) => refusalOf(new URL(link), some);

    expect(refusal("http://localhost:3000/")).toBeUndefined();
    expect(refusal("http://localhost:4000/")).toBe("denied");
    expect(refusal("https://api.example/")).toBe("denied");
    expect(
      refusalOf(
        new URL("https://api.example/"),
        rules([], ["api.example:443"]),
      ),
    ).toBe("denied");
    expect(
      refusalOf(new URL("http://api.example/"), rules([], ["api.example:443"])),
    ).toBeUndefined();
  });

  it("leave to the app a hop it opens only from the operator's link, or a redirect on the same opened host", () => {
    const some = rules(["localhost:3000", "127.0.0.1:3000"]);
    const page = new URL("http://localhost:3000/a");

    expect(isHopOpened(page, some)).toBe(true);
    expect(
      isHopOpened(page, some, {
        url: new URL("http://localhost:3000/b"),
        isOpened: true,
      }),
    ).toBe(true);
    expect(
      isHopOpened(page, some, {
        url: new URL("http://127.0.0.1:3000/b"),
        isOpened: true,
      }),
    ).toBe(false);
    expect(
      isHopOpened(page, some, {
        url: new URL("https://evil.example/"),
        isOpened: false,
      }),
    ).toBe(false);
  });

  it("name a page after its host and path, without the query a token may be in", () => {
    expect(
      pageNameOf(
        new URL("https://museo.example/eventi/notte%20dei%20pianeti?token=x#a"),
      ),
    ).toBe("museo.example/eventi/notte dei pianeti");
    expect(pageNameOf(new URL("https://museo.example/"))).toBe("museo.example");
    expect(pageNameOf(new URL("http://museo.example:8080/a%ZZ"))).toBe(
      "museo.example:8080/a%ZZ",
    );
    expect(
      pageNameOf(new URL(`https://a.example/${"x".repeat(300)}`)),
    ).toHaveLength(200);
  });
});

describe("the addresses a page of the web may have", () => {
  it("are the public ones", () => {
    for (const address of [
      "93.184.215.14",
      "8.8.8.8",
      "2606:4700:4700::1111",
      "::ffff:8.8.8.8",
      "64:ff9b::808:808",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("are never the server's own, a private network's, the cloud's metadata or a reserved one", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "::7f00:1",
      "::ffff:0:7f00:1",
      "::ffff:127.0.0.1",
      "::ffff:a9fe:a9fe",
      "64:ff9b::7f00:1",
      "64:ff9b::10.0.0.1",
      "64:ff9b:1::1",
      "100::1",
      "2001::1",
      "2001:db8::1",
      "2002:7f00:1::1",
      "3fff::1",
      "5f00::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0",
      "fec0::1",
      "ff02::1",
      "[::1]",
      "localhost",
      "not an address",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });
});

describe("the lookup of a connection", () => {
  const resolveTo =
    (...addresses: [string, 4 | 6][]): Resolve =>
    (_host, callback) =>
      callback(
        null,
        addresses.map(([address, family]) => ({ address, family })),
      );
  const lookUp = (
    resolve: Resolve,
    options: { family?: number | string; all?: boolean },
  ) =>
    new Promise<{ error: unknown; address: unknown; family?: number }>((done) =>
      guardedLookup(resolve)("example.org", options, (error, address, family) =>
        done({ error, address, family }),
      ),
    );

  it("answers the addresses as Node asks for them, all or one, of the family it asks", async () => {
    const both = resolveTo(["2606:4700::1", 6], ["93.184.215.14", 4]);

    expect(await lookUp(both, { all: true })).toMatchObject({
      error: null,
      address: [
        { address: "2606:4700::1", family: 6 },
        { address: "93.184.215.14", family: 4 },
      ],
    });
    expect(await lookUp(both, { family: 4 })).toEqual({
      error: null,
      address: "93.184.215.14",
      family: 4,
    });
    expect(await lookUp(both, { family: "IPv6", all: true })).toMatchObject({
      address: [{ address: "2606:4700::1", family: 6 }],
    });
  });

  it("fails before the connection when one address of the host is no address of the web", async () => {
    const mixed = resolveTo(["93.184.215.14", 4], ["10.0.0.5", 4]);
    const { error } = await lookUp(mixed, { all: true });

    expect(error).toMatchObject({ code: "MAPO_AI_ADDRESS_BLOCKED" });
  });
});

/** A server of the test, on the machine's own address, opened to the guard with `allow`. */
let server: Server;
let origin = "";
let seen: { url: string; headers: IncomingHttpHeaders }[] = [];
const routes = new Map<string, (response: ServerResponse) => void>();

beforeAll(async () => {
  server = createServer((request, response) => {
    seen.push({ url: request.url ?? "", headers: request.headers });
    const route = routes.get(request.url ?? "");
    if (route) route(response);
    else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
});

afterEach(() => {
  routes.clear();
  seen = [];
});

describe("Mapo's fetch of a page", () => {
  const opened = () => rules([new URL(origin).host]);
  const request = (
    url: string,
    overrides: Partial<MapoAiFetchRequest> = {},
  ): MapoAiFetchRequest => ({
    url,
    maxBytes: 64 * 1024,
    signal: AbortSignal.timeout(5000),
    ...overrides,
  });
  const html = (text: string) => (response: ServerResponse) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(text);
  };
  const redirect = (to: string) => (response: ServerResponse) => {
    response.writeHead(302, { location: to });
    response.end();
  };

  it("reads a page of a host the app opens, as a stranger asks for it", async () => {
    routes.set("/notte", html("<h1>Notte</h1>"));

    const page = await fetchPage(
      request(`${origin}/notte`, { languages: "it-IT,it;q=0.9" }),
      { rules: opened(), userAgent: "MapoAI test" },
    );

    expect(page).toEqual({
      url: `${origin}/notte`,
      type: "text/html; charset=utf-8",
      bytes: new TextEncoder().encode("<h1>Notte</h1>"),
    });
    const [asked] = seen;
    expect(asked?.headers).toMatchObject({
      "user-agent": "MapoAI test",
      "accept-language": "it-IT,it;q=0.9",
      "accept-encoding": "gzip, deflate, br",
    });
    expect(asked?.headers.cookie).toBeUndefined();
    expect(asked?.headers.authorization).toBeUndefined();
    expect(asked?.headers.referer).toBeUndefined();
  });

  it("refuses an address of the server itself or of a private network, however it is written, before it connects", async () => {
    for (const link of [
      "http://127.0.0.1/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/admin",
    ]) {
      expect(
        await fetchPage(request(link), { rules: rules(), userAgent: "t" }),
        link,
      ).toEqual({ status: "blocked", reason: "address" });
    }
    expect(seen).toEqual([]);
  });

  it("refuses a name that leads to a private address when the connection resolves it", async () => {
    const resolve = vi.fn<Resolve>((_host, callback) =>
      callback(null, [{ address: "10.0.0.7", family: 4 }]),
    );

    const result = await fetchPage(request("http://rebind.example/"), {
      rules: rules(),
      userAgent: "t",
      resolve,
    });

    expect(result).toEqual({ status: "blocked", reason: "address" });
    expect(resolve).toHaveBeenCalledWith(
      "rebind.example",
      expect.any(Function),
    );
  });

  it("never follows a redirect into a host the app opens under another name", async () => {
    const port = new URL(origin).port;
    const both = rules([`127.0.0.1:${port}`, `localhost:${port}`]);
    const resolve = vi.fn<Resolve>((_host, callback) =>
      callback(null, [{ address: "127.0.0.1", family: 4 }]),
    );
    routes.set("/to-alias", redirect(`http://localhost:${port}/page`));
    routes.set("/page", html("<p>Here</p>"));

    const result = await fetchPage(request(`${origin}/to-alias`), {
      rules: both,
      userAgent: "t",
      resolve,
    });

    expect(result).toEqual({ status: "blocked", reason: "address" });
    expect(seen.map((one) => one.url)).toEqual(["/to-alias"]);
  });

  it("checks every redirect again: an address, a name, a scheme, and never a sixth", async () => {
    const resolve: Resolve = (_host, callback) =>
      callback(null, [{ address: "192.168.0.10", family: 4 }]);
    const fetchIt = (path: string) =>
      fetchPage(request(`${origin}${path}`), {
        rules: opened(),
        userAgent: "t",
        resolve,
      });
    routes.set("/to-private", redirect("http://10.0.0.1/"));
    routes.set("/to-name", redirect("http://rebind.example/"));
    routes.set("/to-ftp", redirect("ftp://files.example/a"));
    routes.set("/to-port", redirect("http://example.org:8080/"));
    routes.set("/to-page", redirect("/page"));
    routes.set("/page", html("<p>Here</p>"));
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      routes.set(`/loop/${hop}`, redirect(`/loop/${hop + 1}`));
    }
    routes.set(`/loop/${MAX_REDIRECTS}`, redirect("/page"));

    expect(await fetchIt("/to-private")).toEqual({
      status: "blocked",
      reason: "address",
    });
    expect(await fetchIt("/to-name")).toEqual({
      status: "blocked",
      reason: "address",
    });
    expect(await fetchIt("/to-ftp")).toEqual({
      status: "blocked",
      reason: "scheme",
    });
    expect(await fetchIt("/to-port")).toEqual({
      status: "blocked",
      reason: "port",
    });
    expect(await fetchIt("/to-page")).toMatchObject({ url: `${origin}/page` });
    expect(await fetchIt(`/loop/1`)).toMatchObject({ url: `${origin}/page` });
    expect(await fetchIt(`/loop/0`)).toEqual({
      status: "unreachable",
      reason: "redirects",
    });
  });

  it("stops at maxBytes: a page that says it is larger, one that streams more, one that unzips into more", async () => {
    const small = { maxBytes: 1000 };
    routes.set("/declared", (response) => {
      response.writeHead(200, { "content-length": "5000" });
      response.end("x".repeat(5000));
    });
    routes.set("/streamed", (response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.write("x".repeat(800));
      response.end("x".repeat(800));
    });
    routes.set("/bomb", (response) => {
      response.writeHead(200, { "content-encoding": "gzip" });
      response.end(gzipSync(Buffer.alloc(2_000_000)));
    });
    const fetchIt = (path: string) =>
      fetchPage(request(`${origin}${path}`, small), {
        rules: opened(),
        userAgent: "t",
      });

    expect(await fetchIt("/declared")).toEqual({ status: "too-large" });
    expect(await fetchIt("/streamed")).toEqual({ status: "too-large" });
    expect(await fetchIt("/bomb")).toEqual({ status: "too-large" });
  });

  it("unzips what the page sends zipped: gzip, Brotli, deflate with zlib's wrapping or without", async () => {
    const text = "<p>Notte dei pianeti</p>";
    const zipped =
      (encoding: string, bytes: Buffer): ((response: ServerResponse) => void) =>
      (response) => {
        response.writeHead(200, { "content-encoding": encoding });
        response.end(bytes);
      };
    routes.set("/gzip", zipped("gzip", gzipSync(text)));
    routes.set("/br", zipped("br", brotliCompressSync(text)));
    routes.set("/deflate", zipped("deflate", deflateRawSync(text)));

    for (const path of ["/gzip", "/br", "/deflate"]) {
      const page = await fetchPage(request(`${origin}${path}`), {
        rules: opened(),
        userAgent: "t",
      });
      expect(page, path).toMatchObject({
        bytes: new TextEncoder().encode(text),
      });
    }
  });

  it("says why a page could not be had: an error of its server, a host not found, the time up", async () => {
    routes.set("/slow", () => undefined);
    const notFound: Resolve = (host, callback) =>
      callback(
        Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), {
          code: "ENOTFOUND",
        }),
        [],
      );

    expect(
      await fetchPage(request(`${origin}/missing`), {
        rules: opened(),
        userAgent: "t",
      }),
    ).toEqual({ status: "http-error", httpStatus: 404 });
    expect(
      await fetchPage(request("http://nowhere.example/"), {
        rules: rules(),
        userAgent: "t",
        resolve: notFound,
      }),
    ).toEqual({ status: "unreachable", reason: "dns" });
    expect(
      await fetchPage(
        request(`${origin}/slow`, { signal: AbortSignal.timeout(100) }),
        { rules: opened(), userAgent: "t" },
      ),
    ).toEqual({ status: "unreachable", reason: "timeout" });
  });
});

describe("read/link, the operation", () => {
  const PAGE = `<html><head><title>Notte dei pianeti</title></head>
    <body><nav><a href="/">Home</a></nav><main><p>Vedi <a href="/biglietti">i biglietti</a>.</p></main></body></html>`;
  const page = (overrides: Record<string, unknown> = {}) => ({
    url: "https://museo.example/eventi/notte",
    type: "text/html; charset=utf-8",
    bytes: new TextEncoder().encode(PAGE),
    ...overrides,
  });

  function deps(
    fetcher: MapoAiFetcher,
    overrides: Partial<LinkDependencies> = {},
  ) {
    const touched: Pick<MapoAiReadContext, "file" | "reader" | "parts">[] = [];
    const count = vi.fn();
    const all: LinkDependencies = {
      isOn: true,
      rules: rules(),
      timeout: 5,
      maxBytes: 64 * 1024,
      fetcher,
      read: {
        readers: mapoAiReaders(),
        isOn: () => true,
        maxChars: 100_000,
        touchUp: async (facts) => {
          touched.push(facts);
          return facts.parts;
        },
      },
      count,
      ...overrides,
    };
    return { all, touched, count };
  }

  it("reads a page as a file, named after its host and path, with its address", async () => {
    const fetch = vi.fn<MapoAiFetcher["fetch"]>(async () => page());
    const { all, touched, count } = deps({ fetch });

    const answer = await readSourceLink(
      " https://museo.example/eventi/notte?utm_source=x ",
      all,
    );

    expect(answer).toEqual({
      status: "read",
      reader: "html",
      url: "https://museo.example/eventi/notte",
      parts: [
        {
          kind: "text",
          name: "museo.example/eventi/notte",
          text: [
            "Page title: Notte dei pianeti",
            "Page URL: https://museo.example/eventi/notte",
            "",
            "Vedi [i biglietti](https://museo.example/biglietti).",
          ].join("\n"),
        },
      ],
    });
    expect(count).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({
      url: "https://museo.example/eventi/notte?utm_source=x",
      maxBytes: 64 * 1024,
    });
    expect(touched[0]?.file).toEqual({
      name: "museo.example/eventi/notte",
      type: "text/html; charset=utf-8",
      size: PAGE.length,
      url: "https://museo.example/eventi/notte",
    });
  });

  it("reads the page of a sheet with the reader of its extension", async () => {
    const csv = vi.fn(async () =>
      page({
        url: "https://dati.example/open/eventi.csv",
        type: "application/octet-stream",
        bytes: new TextEncoder().encode("Titolo,Data\nNotte,16/01/2027"),
      }),
    );

    expect(
      await readSourceLink(
        "https://dati.example/open/eventi.csv",
        deps({ fetch: csv }).all,
      ),
    ).toMatchObject({
      status: "read",
      reader: "csv",
      parts: [{ name: "dati.example/open/eventi.csv" }],
    });
  });

  it("answers off, or refuses the link, without counting it and before any fetch", async () => {
    const fetch = vi.fn();
    const off = deps({ fetch }, { isOn: false });
    const denied = deps({ fetch }, { rules: rules([], ["*.museo.example"]) });

    expect(await readSourceLink("https://museo.example/", off.all)).toEqual({
      status: "off",
    });
    for (const [link, reason] of [
      ["not a link", "scheme"],
      ["javascript:alert(1)", "scheme"],
      ["https://me:pw@museo.example/", "credentials"],
      ["https://museo.example:8443/", "port"],
      ["https://www.museo.example/", "denied"],
    ]) {
      expect(await readSourceLink(link ?? "", denied.all), link).toEqual({
        status: "blocked",
        reason,
      });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(denied.count).not.toHaveBeenCalled();
  });

  it("reads what a fetcher answers as outside data", async () => {
    const answers: [unknown, unknown][] = [
      [
        { status: "blocked", reason: "address" },
        { status: "blocked", reason: "address" },
      ],
      [
        { status: "unreachable", reason: "tls" },
        { status: "unreachable", reason: "tls" },
      ],
      [
        { status: "http-error", httpStatus: 403 },
        { status: "http-error", httpStatus: 403 },
      ],
      [
        { status: "http-error", httpStatus: 42 },
        { status: "unreachable", reason: "connection" },
      ],
      [{ status: "too-large" }, { status: "too-large", maxBytes: 64 * 1024 }],
      [
        { status: "blocked", reason: "nope" },
        { status: "unreachable", reason: "connection" },
      ],
      ["a page", { status: "unreachable", reason: "connection" }],
      [
        page({ bytes: "<p>x</p>" }),
        { status: "unreachable", reason: "connection" },
      ],
      [
        page({ bytes: new Uint8Array(64 * 1024 + 1) }),
        { status: "too-large", maxBytes: 64 * 1024 },
      ],
    ];
    for (const [given, expected] of answers) {
      const { all } = deps({ fetch: async () => given as never });
      expect(await readSourceLink("https://museo.example/", all)).toEqual(
        expected,
      );
    }
  });

  it("keeps the link's address when a fetcher answers one that is not the web's, and answers unreachable when it throws", async () => {
    const odd = deps({ fetch: async () => page({ url: "javascript:x" }) });
    const thrown = deps({
      label: "Renderer",
      fetch: async () => {
        throw new Error("renderer down");
      },
    });

    expect(
      await readSourceLink("https://museo.example/a", odd.all),
    ).toMatchObject({
      status: "read",
      url: "https://museo.example/a",
    });
    expect(await readSourceLink("https://museo.example/a", thrown.all)).toEqual(
      {
        status: "unreachable",
        reason: "connection",
      },
    );
  });

  it("stops at the user's limit, before the fetch", async () => {
    const fetch = vi.fn();
    const limited = deps(
      { fetch },
      {
        count: () => {
          throw new Error("429");
        },
      },
    );

    await expect(
      readSourceLink("https://museo.example/", limited.all),
    ).rejects.toThrow("429");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the options of links", () => {
  const read = (web: unknown, more: Record<string, unknown> = {}) => {
    const warnings: string[] = [];
    const options = readRunOptions({ web, ...more }, (message) =>
      warnings.push(message),
    );
    return { options, warnings };
  };

  it("have the defaults of a stranger's visit, and links on", () => {
    const { options, warnings } = read(undefined);

    expect(options.web).toEqual({
      allow: [],
      deny: [],
      userAgent: "Mozilla/5.0 (compatible; MapoAI/1.0)",
      timeout: 20,
    });
    expect(options.limits.linksPerUserPerMinute).toBe(20);
    expect(linksAreOn(options)).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("leave out a host of allow that cannot be read, and every host", () => {
    const { options, warnings } = read({
      allow: ["localhost:3000", "https://x.example", "*", 3],
    });

    expect(options.web.allow).toEqual(["localhost:3000"]);
    expect(warnings).toHaveLength(3);
  });

  it("keep every host out when deny cannot be read whole, and links are off", () => {
    for (const deny of ["ads.example", ["ads.example", "https://x"], [7]]) {
      const { options, warnings } = read({ deny });
      expect(options.web.deny, String(deny)).toEqual(["*"]);
      expect(linksAreOn(options)).toBe(false);
      expect(warnings.at(-1)).toContain("reads no page");
    }
    expect(read("all of them").options.web.deny).toEqual(["*"]);
  });

  it("keep the default of a time or a client they cannot read", () => {
    const { options, warnings } = read({
      timeout: 500,
      userAgent: "two\nlines",
    });

    expect(options.web).toMatchObject({
      timeout: 20,
      userAgent: "Mozilla/5.0 (compatible; MapoAI/1.0)",
    });
    expect(warnings).toHaveLength(2);
  });

  it("turn links off when deny keeps out every host, however it is written", () => {
    const on = read(undefined).options;

    expect(linksAreOn({ ...on, web: { ...on.web, deny: [" * "] } })).toBe(
      false,
    );
  });

  it("turn links off with the link reader, a limit at 0, or a page of 0 bytes", () => {
    const on = read(undefined).options;
    const off = (change: Partial<MapoAiRunOptions>) =>
      linksAreOn({ ...on, ...change });

    expect(off({ readers: { link: false } })).toBe(false);
    expect(off({ readers: { link: true, xlsx: false } })).toBe(true);
    expect(off({ limits: { ...on.limits, linksPerUserPerMinute: 0 } })).toBe(
      false,
    );
    expect(off({ limits: { ...on.limits, maxFileBytes: 0 } })).toBe(false);
  });
});

describe("registerMapoAiFetcher", () => {
  it("takes one fetcher, with its fetch()", async () => {
    vi.resetModules();
    const { registerMapoAiFetcher, registeredMapoAiFetcher } =
      await import("../runtime/server/links/registry");

    expect(registeredMapoAiFetcher()).toBeUndefined();
    expect(() => registerMapoAiFetcher({} as MapoAiFetcher)).toThrow(TypeError);
    registerMapoAiFetcher({ label: "Renderer", fetch: async () => page() });
    expect(registeredMapoAiFetcher()?.label).toBe("Renderer");
    expect(() => registerMapoAiFetcher({ fetch: async () => page() })).toThrow(
      "registered already",
    );

    function page() {
      return { url: "https://a.example/", type: "", bytes: new Uint8Array() };
    }
  });

  it("keeps the id link for links: no reader takes it", async () => {
    vi.resetModules();
    const { registerMapoAiReader } =
      await import("../runtime/server/readers/registry");

    expect(() =>
      registerMapoAiReader({
        id: "link",
        extensions: ["url"],
        read: () => [],
      }),
    ).toThrow("turns links off");
  });
});
