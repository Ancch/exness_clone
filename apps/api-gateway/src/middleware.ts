import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken"

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export function auth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const token = req.headers["authorization"];

        if (!token) {
            res.status(401).json({ message: "Auth token missing"});
            return;
        }

        const decodedToken = jwt.verify(
            token as string,
            process.env.JWT_SECRET || ''
        ) as JwtPayload;

        if (decodedToken && decodedToken.id) {
            req.userId = decodedToken.id;
            next();
        } else {
            res.status(403).json({ message: "Invalid token" })
        }

    } catch (err) {
        console.error("Authentication error:", err);
        res.status(403).json({ message: "You are not signed in" });
    }
}