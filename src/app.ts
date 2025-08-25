import express from "express";
import cors from "cors";
import indexRoutes from "./routes/index.routes.js";
import cookieParser from "cookie-parser";

const allowedOrigins = ["http://localhost:5173", "https://csitkmce.vercel.app"];

const app = express();

app.use((req, res, next) => {
  if (req.headers.origin && allowedOrigins.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,PUT,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      ["Content-Type", "Authorization", "Set-Cookie"].join(",")
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(cookieParser());
app.use(express.json());
app.use("/api/", indexRoutes);

export default app;
