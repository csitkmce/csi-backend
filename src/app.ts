import express from "express";
import cors from "cors";
import indexRoutes from "./routes/index.routes.js";
import cookieParser from "cookie-parser";

const allowedOrigins = ["http://localhost:5173", "https://csitkmce.vercel.app"];

const app = express();
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Set-Cookie"],
  })
);
app.use(express.json());
app.use("/api/", indexRoutes);

export default app;
