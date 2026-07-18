import assert from "node:assert/strict";
import { shouldRejectInsecureRequest } from "../../dist/services/auth-transport-security.js";

const productionWithoutProxyTrust = {
  isProduction: true,
  trustProxy: false
};

// Given: a production authentication request over direct HTTP
// When: the request has no TLS transport and no trusted proxy
// Then: it is rejected.
assert.equal(
  shouldRejectInsecureRequest({
    ...productionWithoutProxyTrust,
    path: "/api/auth/login",
    socketEncrypted: false,
    forwardedProto: undefined
  }),
  true
);

// Given: a direct HTTP request that spoofs a forwarding header
// When: proxy trust is disabled
// Then: it is still rejected.
assert.equal(
  shouldRejectInsecureRequest({
    ...productionWithoutProxyTrust,
    path: "/api/auth/login",
    socketEncrypted: false,
    forwardedProto: "https"
  }),
  true
);

// Given: a production request received through the Caddy TLS terminator
// When: the proxy is explicitly trusted and forwards HTTPS
// Then: it is allowed.
assert.equal(
  shouldRejectInsecureRequest({
    isProduction: true,
    trustProxy: true,
    path: "/api/auth/login",
    socketEncrypted: false,
    forwardedProto: "https"
  }),
  false
);

// Given: a local development request over HTTP
// When: it targets an authentication route
// Then: it remains allowed.
assert.equal(
  shouldRejectInsecureRequest({
    isProduction: false,
    trustProxy: false,
    path: "/api/auth/login",
    socketEncrypted: false,
    forwardedProto: undefined
  }),
  false
);

// Given: identity and proctoring data on another API route.
// When: production receives it over direct HTTP.
// Then: the same TLS requirement protects all API traffic.
assert.equal(
  shouldRejectInsecureRequest({
    ...productionWithoutProxyTrust,
    path: "/api/exams/invites/token/identity-verifications",
    socketEncrypted: false,
    forwardedProto: undefined
  }),
  true
);

console.log("auth transport security regression passed");
