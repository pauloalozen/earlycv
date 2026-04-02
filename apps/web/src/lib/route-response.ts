import { NextResponse } from "next/server";

import {
  APP_ACCESS_TOKEN_COOKIE_NAME,
  APP_REFRESH_TOKEN_COOKIE_NAME,
} from "./app-session";
import { BACKOFFICE_SESSION_COOKIE_NAME } from "./backoffice-session";

export function createPostRedirectResponse(
  requestUrl: string,
  redirectPath: string,
) {
  return NextResponse.redirect(new URL(redirectPath, requestUrl), 303);
}

export function createSessionTerminationResponse(
  requestUrl: string,
  redirectPath: string,
) {
  const url = new URL(requestUrl);
  const response = createPostRedirectResponse(url.toString(), redirectPath);
  const secure = url.protocol === "https:";

  for (const cookieName of [
    APP_ACCESS_TOKEN_COOKIE_NAME,
    APP_REFRESH_TOKEN_COOKIE_NAME,
    BACKOFFICE_SESSION_COOKIE_NAME,
  ]) {
    response.cookies.set({
      httpOnly: true,
      maxAge: 0,
      name: cookieName,
      path: "/",
      sameSite: "lax",
      secure,
      value: "",
    });
  }

  return response;
}
