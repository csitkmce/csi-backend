import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";
import fetch from "node-fetch";
import type { AuthenticatedRequest } from "../../middleware/auth.middle.js";

function generateBatchQuery(usernames: string[]) {
  const queries = usernames
    .map(
      (username, idx) => `
      u${idx}: matchedUser(username: "${username}") {
        username
        submitStats: submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }`
    )
    .join("\n");

  return { query: `query { ${queries} }` };
}

async function getBatchStats(usernames: string[]) {
  if (usernames.length === 0) return [];

  const queryPayload = generateBatchQuery(usernames);

  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(queryPayload),
  });

  const data = await response.json();
  const stats: { username: string; totalSolved: number }[] = [];

  for (let key in data.data) {
    const userData = data.data[key];

    if (!userData) continue;

    const acStats = userData.submitStats?.acSubmissionNum || [];
    stats.push({
      username: userData.username,
      totalSolved: acStats.find((s: any) => s.difficulty === "All")?.count || 0,
    });
  }

  return stats;
}

async function getLeaderboardData() {
  try {
    // 1. Join leetcode_users with users to get name + username
    const result = await pool.query(`
      SELECT u.name, lu.username
      FROM leetcode_users lu
      JOIN users u ON lu.user_id = u.user_id
    `);

    const users = result.rows; 
    // [{ name: "Noah John", username: "NJP5" }, ...]

    // 2. Collect usernames
    const usernames = users.map((u) => u.username);

    // 3. Fetch stats from LeetCode API
    const stats = await getBatchStats(usernames);
    // [{ username: "NJP5", totalSolved: 120 }, ...]

    // 4. Merge DB data + stats
    const merged = users.map((u) => {
      const stat = stats.find((s) => s.username === u.username);
      return {
        dbName: u.name, // take name from users table
        username: u.username,
        totalSolved: stat?.totalSolved || 0,
      };
    });

    // 5. Sort by solved problems
    merged.sort((a, b) => b.totalSolved - a.totalSolved);

    // 6. Format leaderboard
    const leaderboard = merged.map((u, i) => ({
      rank: i + 1,
      name: u.dbName,
      username: u.username,
      points: u.totalSolved,
    }));

    console.log("Leaderboard data fetched");
    return leaderboard;
  } catch (err) {
    console.error("Failed to fetch leaderboard data:", err);
    return [];
  }
}

export const getLeaderboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const leaderboard = await getLeaderboardData();
    const top15 = leaderboard.slice(0, 15);

    let userRegistered: boolean | null = null;

    console.log("req.user:", req.user); // <-- debug logged-in user

    if (req.user) {
      const check = await pool.query(
        `SELECT 1 FROM leetcode_users WHERE user_id = $1`,
        [req.user.user_id]
      );
      console.log("DB check rows:", check.rows); // <-- debug DB result
      userRegistered = check.rows.length > 0;
    }

    console.log("userRegistered:", userRegistered);

    res.status(200).json({
      lastUpdated: "Just now",
      leaderboard: top15,
      userRegistered, // null = not logged in
    });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
};

export async function registerLeetcode(req: AuthenticatedRequest, res: Response) {
  const { leetcodeId } = req.body;

  if (!leetcodeId) {
    return res.status(400).json({ message: "LeetCode ID is required" });
  }

  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const { user_id, name } = req.user;

const result = await pool.query(
  `INSERT INTO leetcode_users (user_id, username)
   VALUES ($1, $2)
   ON CONFLICT (user_id) DO UPDATE 
   SET username = EXCLUDED.username
   RETURNING *`,
  [user_id, leetcodeId]
);

    res.status(201).json({
      message: "LeetCode ID registered successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Register LeetCode error:", err);
    res.status(500).json({ message: "Failed to register LeetCode ID" });
  }
}