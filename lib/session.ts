import type { SessionOptions } from "iron-session";

export interface SessionData {
  isLoggedIn: boolean;
}

export const sessionOptions: SessionOptions = {
  password:    process.env.SESSION_SECRET!,
  cookieName:  "sss_session",
  cookieOptions: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   60 * 60 * 24 * 7, // 7 days in seconds
  },
};
