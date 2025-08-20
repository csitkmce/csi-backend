import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";

export const getExecom = (req: Request, res: Response) => {
  res.json({ message: "Execom endpoint working!" });
};

export const getYears = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT DISTINCT academic_year 
      FROM execom 
      WHERE academic_year IS NOT NULL
      ORDER BY academic_year DESC
    `;
    const result = await pool.query(query);

    const years = result.rows.map((row) => row.academic_year);

    res.status(200).json({ years });
  } catch (error) {
    console.error("Error fetching years:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getExecomByYear = async (req: Request, res: Response) => {
  const { year } = req.params;

  try {
    const query = `
      SELECT 
        e.name,
        e.batch,
        e.upload_image,
        e.social_link,
        e.academic_year,
        p.title AS position
      FROM execom e
      LEFT JOIN execom_positions p ON e.position_id = p.position_id
      WHERE e.academic_year = $1
      ORDER BY p.title, e.name
    `;
    const { rows } = await pool.query(query, [year]);

    if (!rows.length) {
      return res
        .status(404)
        .json({ error: `No execom members found for academic year ${year}` });
    }

    const grouped: Record<string, any[]> = {};

    rows.forEach((member) => {
      const parts = (member.position || "Unknown-Unknown").split("-", 2);
      const team = (parts[0] ?? "Unknown").trim();
      const role = (parts[1] ?? "Unknown").trim();

      if (!grouped[team]) grouped[team] = [];

      const { position, academic_year, ...rest } = member;

      grouped[team].push({
        ...rest,
        role: role.charAt(0).toUpperCase() + role.slice(1).toLowerCase(),
      });
    });

    return res.status(200).json({ academic_year: year, ...grouped });
  } catch (error) {
    console.error("Execom academic year view error:", error);
    return res
      .status(500)
      .json({
        error: `Failed to load execom members for academic year ${year}`,
      });
  }
};
