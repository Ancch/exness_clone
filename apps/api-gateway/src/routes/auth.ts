import express, { Request, Response, Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from '@repo/db';
import { signinSchema, signupSchema } from "src/schema/signupSchema";

const authRouter: Router = express.Router();

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, bcrypt.genSaltSync());
}

function comparePassword(raw: string, hash: string): boolean {
  return bcrypt.compareSync(raw, hash);
}


authRouter.post("/signup", async (req: Request, res: Response) => {
  const input = signupSchema.safeParse(req.body);

  if (!input.success) {
    const errorMessage = input.error.issues.map((e) => e.message);

    return res.status(411).json({
      message: signupSchema.shape,
      error: errorMessage,
    });
  }

  const { email, password } = req.body;

  try {
    const existingUser = await query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        message: "Email already taken",
      });
    }

    const hashedPassword = hashPassword(password);

    const user = await query(
      `INSERT INTO users (email, password)
       VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email, hashedPassword]
    );

    res.status(201).json({
      message: "User created",
      user: user[0],
    });
  } catch (err) {
    console.error("signup error:", err);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});


authRouter.post("/signin", async (req: Request, res: Response) => {
  const input = signinSchema.safeParse(req.body);

  if (!input.success) {
    const errorMessage = input.error.issues.map((e) => e.message);

    return res.status(411).json({
      message: errorMessage || "Invalid format",
      error: errorMessage,
    });
  }

  const { email, password } = req.body;

  try {
    const users = await query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = users[0];

    const isValid = comparePassword(password, user.password);

    if (!isValid) {
      return res.status(401).json({
        message: "Invalid creds",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET || "",
      {
        expiresIn: "7d",
      }
    );

    res.status(200).json({
      message: "User logged in",
      token,
      email: user.email,
    });
  } catch (err) {
    console.error("signin error:", err);

    res.status(500).json({
      message: "server error",
    });
  }
});

export default authRouter;