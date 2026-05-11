import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import authRouter from "./routes/auth"
import accountRouter from './routes/accounts';
import marketRouter from './routes/market';
import orderRouter from './routes/orders';
import positions from './routes/positions';
import walletRouter from './routes/wallet';

// Load repo-level .env then package-level .env (package overrides repo)
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const PORT = process.env.PORT || 4000;
const app = express();
app.use(express.json());


app.use("/api/v1", authRouter);
app.use("/api/v1", accountRouter);
app.use("/api/v1", marketRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", positions);
app.use("/api/v1", walletRouter);
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});