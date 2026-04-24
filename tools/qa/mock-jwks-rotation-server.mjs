#!/usr/bin/env node

import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { createServer } from "node:http";
import process from "node:process";

const port = Number(process.env.MOCK_JWKS_PORT ?? 43181);
const host = process.env.MOCK_JWKS_HOST ?? "127.0.0.1";
const state = createState();
const server = createServer((request, response) => handleRequest(request, response));

server.listen(port, host, () => {
  process.stdout.write(`[mock-jwks-rotation-server] listening on http://${host}:${port}\n`);
});

registerShutdown("SIGINT");
registerShutdown("SIGTERM");

function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", baseOrigin());
  const parts = pathParts(url.pathname);

  if (request.method === "GET" && url.pathname === "/health") {
    return writeJson(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/state") {
    return writeJson(response, 200, snapshotState());
  }

  if (request.method === "POST" && url.pathname === "/scenario/reset") {
    return resetScenario(response, url.searchParams.get("target"));
  }

  if (request.method === "POST" && url.pathname === "/scenario/rotate") {
    return rotateScenario(response, url.searchParams.get("target"));
  }

  if (request.method === "GET" && url.pathname === "/upstream/.well-known/openid-configuration") {
    return writeJson(response, 200, upstreamDiscoveryDocument());
  }

  if (request.method === "GET" && url.pathname === "/upstream/oauth/v2/keys") {
    return writeJson(response, 200, currentJwks("upstream"), cacheHeaders());
  }

  if (request.method === "GET" && url.pathname === "/broker/jwks") {
    return writeJson(response, 200, currentJwks("broker"), cacheHeaders());
  }

  if (request.method === "GET" && parts[0] === "issue") {
    return issueToken(response, parts[1], parts[2], url);
  }

  writeJson(response, 404, { error: "not_found" });
}

function resetScenario(response, target) {
  const issuer = issuerState(target);

  issuer.currentKid = "old";
  issuer.jwksHits = 0;
  writeJson(response, 200, { ok: true, target, currentKid: issuer.currentKid });
}

function rotateScenario(response, target) {
  const issuer = issuerState(target);

  issuer.currentKid = "new";
  writeJson(response, 200, { ok: true, target, currentKid: issuer.currentKid });
}

function issueToken(response, target, kind, url) {
  const issuer = issuerState(target);
  const key = selectKey(issuer, url.searchParams.get("kid"));
  const token = encodeJwt(tokenClaims(target, kind, url), key);

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(token);
}

function createState() {
  return {
    broker: createIssuerState("broker"),
    upstream: createIssuerState("upstream"),
  };
}

function createIssuerState(target) {
  return {
    currentKid: "old",
    jwksHits: 0,
    keys: {
      old: createKey(`${target}-old-kid`),
      new: createKey(`${target}-new-kid`),
    },
  };
}

function createKey(kid) {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = pair.publicKey.export({ format: "jwk" });

  return {
    kid,
    privateKey: pair.privateKey,
    publicJwk: { ...publicJwk, alg: "RS256", kid, use: "sig" },
  };
}

function currentJwks(target) {
  const issuer = issuerState(target);

  issuer.jwksHits += 1;

  return { keys: [issuer.keys[issuer.currentKid].publicJwk] };
}

function issuerState(target) {
  if (target === "broker" || target === "upstream") {
    return state[target];
  }

  throw new Error(`Unsupported target: ${target}`);
}

function selectKey(issuer, requested) {
  if (requested === "old" || requested === "new") {
    return issuer.keys[requested];
  }

  return issuer.keys[issuer.currentKid];
}

function tokenClaims(target, kind, url) {
  if (target === "upstream" && kind === "id") {
    return upstreamIdClaims(url);
  }

  if (target === "broker" && kind === "access") {
    return brokerAccessClaims();
  }

  throw new Error(`Unsupported token scenario: ${target}/${kind}`);
}

function upstreamIdClaims(url) {
  const now = Math.floor(Date.now() / 1000);

  return {
    iss: `${baseOrigin()}/upstream`,
    aud: "broker-client",
    sub: "47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c",
    nonce: url.searchParams.get("nonce") ?? "expected-nonce",
    iat: now,
    exp: now + 300,
  };
}

function brokerAccessClaims() {
  const now = Math.floor(Date.now() / 1000);

  return {
    iss: `${baseOrigin()}/broker`,
    aud: "sso-resource-api",
    sub: "subject-123",
    sid: "shared-sid",
    client_id: "prototype-app-b",
    token_use: "access",
    email: "ada@example.com",
    name: "Ada Lovelace",
    iat: now,
    exp: now + 300,
  };
}

function upstreamDiscoveryDocument() {
  return {
    issuer: `${baseOrigin()}/upstream`,
    authorization_endpoint: `${baseOrigin()}/upstream/oauth/v2/authorize`,
    token_endpoint: `${baseOrigin()}/upstream/oauth/v2/token`,
    jwks_uri: `${baseOrigin()}/upstream/oauth/v2/keys`,
    end_session_endpoint: `${baseOrigin()}/upstream/oidc/v1/end_session`,
  };
}

function snapshotState() {
  return {
    broker: summarizeIssuer("broker"),
    upstream: summarizeIssuer("upstream"),
  };
}

function summarizeIssuer(target) {
  const issuer = issuerState(target);

  return {
    currentKid: issuer.currentKid,
    jwksHits: issuer.jwksHits,
    kids: {
      old: issuer.keys.old.kid,
      new: issuer.keys.new.kid,
    },
  };
}

function encodeJwt(claims, key) {
  const header = { alg: "RS256", kid: key.kid, typ: "JWT" };
  const signingInput = `${encodeSegment(header)}.${encodeSegment(claims)}`;
  const signature = cryptoSign("RSA-SHA256", Buffer.from(signingInput), key.privateKey);

  return `${signingInput}.${toBase64Url(signature)}`;
}

function encodeSegment(value) {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

function toBase64Url(buffer) {
  return buffer.toString("base64url");
}

function cacheHeaders() {
  return { "Cache-Control": "public, max-age=300" };
}

function pathParts(pathname) {
  return pathname.split("/").filter(Boolean);
}

function baseOrigin() {
  return `http://${host}:${port}`;
}

function writeJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function registerShutdown(signal) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
