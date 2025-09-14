import type { Request, Response } from "express";
import { pool } from "../../config/db.js";

export const getAccommodation = async (req: Request, res: Response) => {
    const query = 'SELECT accommodation_id, accommodation FROM accommodations ORDER BY accommodation ASC';
    const { rows } = await pool.query(query);
    if (!rows) return res.status(401).json({ error: 'Something went wrong' });
    res.json(rows);
}