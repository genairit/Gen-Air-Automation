const SIGNED_CLIENT_COOKIE_PATTERN = /^[^=]+=([0-9a-f]{32})\.([0-9a-f]{64})$/;

export const parseSignedClientCookie = (setCookie: string): string => {
  const cookie = setCookie.split(";")[0];

  if (!SIGNED_CLIENT_COOKIE_PATTERN.test(cookie)) {
    throw new Error("The anonymous client cookie is missing or unsigned");
  }

  return cookie;
};
