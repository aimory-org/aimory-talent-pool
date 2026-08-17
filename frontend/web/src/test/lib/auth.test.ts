import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for the custom-domain rollout: the deploy workflow used to
 * bake the CloudFront hostname into VITE_COGNITO_REDIRECT_URI, so Amplify was
 * handed a redirect list that never matched arrow.aimoryconsulting.com and
 * sign-in failed there with no visible error. Leaving the variable unset makes
 * the bundle work on every origin it is served from.
 */
describe("getAmplifyConfig", () => {
  const loadOauth = async () => {
    const { getAmplifyConfig } = await import("../../lib/auth");
    const oauth = getAmplifyConfig().Auth?.Cognito?.loginWith?.oauth;
    if (!oauth) throw new Error("oauth config missing");
    return oauth;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "us-east-1_TESTPOOL");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "testclientid");
    vi.stubEnv("VITE_COGNITO_DOMAIN", "test.auth.us-east-1.amazoncognito.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to the serving origin when no redirect URI is configured", async () => {
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "");

    const oauth = await loadOauth();

    expect(oauth.redirectSignIn).toEqual([window.location.origin]);
    expect(oauth.redirectSignOut).toEqual([window.location.origin]);
  });

  it("honours an explicitly configured redirect URI", async () => {
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://configured.example");

    const oauth = await loadOauth();

    expect(oauth.redirectSignIn).toEqual(["https://configured.example"]);
    expect(oauth.redirectSignOut).toEqual(["https://configured.example"]);
  });
});
