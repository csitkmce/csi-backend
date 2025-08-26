import express from "express";
import cors from "cors";
import indexRoutes from "./routes/index.routes.js";
import cookieParser from "cookie-parser";

const app = express();

const allowedOrigins = ["http://localhost:5173", "https://csitkmce.vercel.app"];
const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    if (!origin) return callback(null, true); 
    if (allowedOrigins.includes(origin)) callback(null, true);
    else callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(cookieParser());
app.use(express.json());
app.use("/api/", indexRoutes);

export default app;
