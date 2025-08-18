import { type Request, type Response } from "express";

const getHome = (req: Request, res: Response) => {
    res.json({ message: 'Hello from Modular Express + TS + CORS!' });
}

export default getHome;