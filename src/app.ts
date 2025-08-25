import express from 'express';
import cors from 'cors';
import indexRoutes from './routes/index.routes.js';
import cookieParser from "cookie-parser";

const app = express();
app.use(cookieParser());

app.use(cors());
app.use(express.json());
app.use('/api/', indexRoutes);

export default app;