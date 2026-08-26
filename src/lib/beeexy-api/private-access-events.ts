import { BeeexyApiError } from "./problem-details";

export const PRIVATE_ACCESS_REQUIRED_TITLE = "Private access required.";

type PrivateAccessRequiredListener = () => void;

const listeners = new Set<PrivateAccessRequiredListener>();

export function isPrivateAccessRequiredError(error: unknown) {
  return error instanceof BeeexyApiError
    && error.status === 401
    && error.problem?.title === PRIVATE_ACCESS_REQUIRED_TITLE;
}

export function notifyPrivateAccessRequired() {
  for (const listener of listeners) listener();
}

export function subscribeToPrivateAccessRequired(listener: PrivateAccessRequiredListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
