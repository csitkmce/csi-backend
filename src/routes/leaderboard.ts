import { Router } from "express";
import { pool } from "../config/db.js";
import fetch from "node-fetch";

const router = Router();

// helper to fetch stats from LeetCode GraphQL
async function getStats(username: string) {
  const query = {
    query: `
      query userProfile($username: String!) {
        matchedUser(username: $username) {
          username
          submitStats: submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
            }
          }
        }
      }
    `,
    variables: { username },
  };

  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });

  const data = await response.json();
  const stats = data.data?.matchedUser?.submitStats?.acSubmissionNum || [];

  return {
    username,
    totalSolved: stats.reduce((acc: number, cur: any) => acc + cur.count, 0),
  };
}

router.get("/", async (req, res) => {
  try {
    // fetch name + username from DB
    const result = await pool.query("SELECT name, username FROM leetcode_users");
    const users = result.rows;
    console.log("Fetched users from DB:", users);

    // fetch LeetCode stats for each username
    const stats = await Promise.all(
      users.map(u =>
        getStats(u.username).then(s => ({
          dbName: u.name,      // <-- use DB name
          username: u.username,
          totalSolved: s.totalSolved,
        }))
      )
    );
    console.log("Fetched stats:", stats);

    // sort by problems solved
    stats.sort((a, b) => b.totalSolved - a.totalSolved);

    // build leaderboard
    const leaderboard = stats.map((u, i) => ({
      rank: i + 1,
      name: u.dbName,         // <-- show DB name here
      points: u.totalSolved,
    }));

    res.json(leaderboard);
  } catch (err) {
    if (err && typeof err === "object" && "message" in err) {
      console.error(
        "Leaderboard error:",
        (err as { message: string; stack?: string }).message,
        (err as { stack?: string }).stack
      );
      res
        .status(500)
        .json({ error: "Failed to fetch leaderboard", details: (err as { message: string }).message });
    } else {
      console.error("Leaderboard error:", err);
      res
        .status(500)
        .json({ error: "Failed to fetch leaderboard", details: String(err) });
    }
  }
});

export default router;
