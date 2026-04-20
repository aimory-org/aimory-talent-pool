import { useState, useEffect, useCallback } from "react";
import { signOut, fetchAuthSession } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export interface UserInfo {
  username: string;
  email: string;
  name?: string;
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut();
  } catch (error) {
    console.error("Sign-out failed", error);
  }
}

export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkUser = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;

      if (!idToken) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const payload = idToken.payload;
      setUser({
        username: (payload.sub as string) || "unknown",
        email:
          (payload.email as string) || (payload.sub as string) || "unknown",
        name: payload.name as string | undefined,
      });

      // Clear OAuth code from URL after successful auth
      if (window.location.search.includes("code=")) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err) {
      console.debug("No authenticated user:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = Hub.listen(
      "auth",
      ({ payload }: { payload: { event: string } }) => {
        console.debug("Auth event:", payload.event);
        switch (payload.event) {
          case "signedIn":
          case "signInWithRedirect":
          case "tokenRefresh":
            checkUser();
            break;
          case "signedOut":
            setUser(null);
            setIsLoading(false);
            break;
          case "signInWithRedirect_failure":
            console.error("OAuth redirect failed");
            setIsLoading(false);
            break;
        }
      },
    );

    checkUser();

    return unsubscribe;
  }, [checkUser]);

  return { user, isLoading };
}
