import { test as setup } from "@playwright/test";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import fs from "fs";
import path from "path";

// Mints a real Cognito session for a native (non-federated) test user via
// USER_PASSWORD_AUTH, then seeds it into localStorage in the format
// aws-amplify/auth expects, so Playwright never has to drive the Microsoft
// Entra ID login screen (which CI can't do headlessly - see infra/modules/auth).
//
// The <username> segment of the storage keys is arbitrary - amplify only
// requires it be self-consistent with LastAuthUser (see
// @aws-amplify/auth DefaultTokenStore.getAuthKeys/getLastAuthUser).
const AUTH_FILE = "e2e/.auth/user.json";
const STORAGE_USERNAME = "e2e-test-user";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

setup("authenticate", async ({ page, baseURL }) => {
  const region = process.env.AWS_REGION || "us-east-1";
  const clientId = requireEnv("COGNITO_CLIENT_ID");
  const username = requireEnv("E2E_TEST_USER_EMAIL");
  const password = requireEnv("E2E_TEST_USER_PASSWORD");

  const client = new CognitoIdentityProviderClient({ region });
  const result = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    }),
  );

  const tokens = result.AuthenticationResult;
  if (!tokens?.AccessToken || !tokens.IdToken || !tokens.RefreshToken) {
    throw new Error(
      `Cognito did not return tokens for the E2E test user (ChallengeName: ${
        result.ChallengeName ?? "none"
      }). Check that the test user's password is permanent (FORCE_CHANGE_PASSWORD blocks this flow).`,
    );
  }

  await page.goto(baseURL!);

  await page.evaluate(
    ({ clientId, storageUsername, accessToken, idToken, refreshToken }) => {
      const prefix = `CognitoIdentityServiceProvider.${clientId}`;
      localStorage.setItem(`${prefix}.LastAuthUser`, storageUsername);
      localStorage.setItem(
        `${prefix}.${storageUsername}.accessToken`,
        accessToken,
      );
      localStorage.setItem(`${prefix}.${storageUsername}.idToken`, idToken);
      localStorage.setItem(
        `${prefix}.${storageUsername}.refreshToken`,
        refreshToken,
      );
      localStorage.setItem(`${prefix}.${storageUsername}.clockDrift`, "0");
    },
    {
      clientId,
      storageUsername: STORAGE_USERNAME,
      accessToken: tokens.AccessToken,
      idToken: tokens.IdToken,
      refreshToken: tokens.RefreshToken,
    },
  );

  // Reload so the app picks up the seeded session on this navigation.
  await page.reload();

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
