import type { BeeexyAuthApi } from "@/lib/beeexy-api/auth-api";
import type { AuthenticationResponse } from "@/lib/beeexy-api/contracts";
import type { SessionStore } from "@/lib/beeexy-api/session-storage";
import { sessionFromAuthentication } from "@/lib/beeexy-api/session-storage";

export async function bootstrapCurrentSession(authApi: BeeexyAuthApi) {
  const account = await authApi.getCurrentAccount();
  const patient = await authApi.getCurrentPatient();
  return { account, patient };
}

export async function establishSession(authApi: BeeexyAuthApi, sessionStore: SessionStore, response: AuthenticationResponse) {
  sessionStore.write(sessionFromAuthentication(response));
  return bootstrapCurrentSession(authApi);
}

export async function logoutAndClearSession(authApi: BeeexyAuthApi, sessionStore: SessionStore) {
  try {
    if (sessionStore.read()) await authApi.logout();
  } finally {
    sessionStore.clear();
  }
}
