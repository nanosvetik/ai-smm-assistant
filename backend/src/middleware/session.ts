import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions } from "../db/schema.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clientId?: string;
    }
  }
}

// Для эндпоинтов онбординга/дашборда, которые появятся позже — сейчас не
// используется ни одним роутом, но флоу доступа без него не закончен.
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.session;
  if (!token) {
    res.status(401).json({ error: "no_session" });
    return;
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || session.expiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: "session_expired" });
    return;
  }

  req.clientId = session.clientId;
  next();
}
