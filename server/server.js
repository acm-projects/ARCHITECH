import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import authRouter from "./auth.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
