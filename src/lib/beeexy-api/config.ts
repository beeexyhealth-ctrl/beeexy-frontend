const DEFAULT_LOCAL_API_URL = "http://localhost:5105";

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const beeexyApiConfig = {
  baseUrl: withoutTrailingSlash(process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_LOCAL_API_URL),
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
} as const;
