import type { Request, Response } from "express";
import { pool } from "../../config/db.js";

export const getDepts = async (req: Request, res: Response) => {
    const query = 'SELECT department_id, department_name FROM departments orderby department_name';
    const { rows } = await pool.query(query);

    if (!rows) return res.status(401).json({ error: 'Something went wrong' });

    res.json(rows);
} 