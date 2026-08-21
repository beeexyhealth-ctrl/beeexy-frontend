import { BeeexyApiError, BeeexyNetworkError } from "@/lib/beeexy-api/problem-details";

export function challengeErrorMessage(error: unknown, resend = false) {
  if (error instanceof BeeexyNetworkError) return "Beeexy couldn’t reach the server. Check your connection and try again.";
  if (error instanceof BeeexyApiError) {
    if (error.status === 422) return "Enter a valid email address and try again.";
    if (error.status === 429) return retryLaterMessage(error, resend ? "A new code can’t be requested yet." : "A code can’t be requested yet.");
  }
  return "Beeexy couldn’t send a code right now. Please try again.";
}

export function verificationErrorMessage(error: unknown) {
  if (error instanceof BeeexyNetworkError) return "Beeexy couldn’t reach the server. Your code was not verified.";
  if (error instanceof BeeexyApiError) {
    if (error.status === 401) return "That code is incorrect or has expired. Request a new code and try again.";
    if (error.status === 409) return "That code has already been used. Request a new code to continue.";
    if (error.status === 422) return "Enter a valid six-digit code.";
    if (error.status === 429) return retryLaterMessage(error, "Too many verification attempts.");
  }
  return "Beeexy couldn’t verify the code right now. Please try again.";
}

export function googleErrorMessage(error: unknown) {
  if (error instanceof BeeexyNetworkError) return "Beeexy couldn’t reach the server. Google sign-in was not completed.";
  if (error instanceof BeeexyApiError) {
    if (error.status === 401) return "Google sign-in could not be verified. Please try again.";
    if (error.status === 422) return "Google did not return a usable sign-in credential. Please try again.";
    if (error.status === 503) return "Google sign-in is temporarily unavailable. You can continue with email.";
  }
  return "Google sign-in couldn’t be completed. Please try again.";
}

function retryLaterMessage(error: BeeexyApiError, fallback: string) {
  return error.retryAfter ? `${fallback} Try again after ${error.retryAfter}.` : `${fallback} Please wait and try again.`;
}
