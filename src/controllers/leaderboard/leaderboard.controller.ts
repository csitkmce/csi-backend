import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";
import fetch from "node-fetch";

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

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT name, username FROM leetcode_users");
    const users = result.rows;

    const stats = await Promise.all(
      users.map((u) =>
        getStats(u.username).then((s) => ({
          dbName: u.name, 
          username: u.username,
          totalSolved: s.totalSolved,
        }))
      )
    );

    stats.sort((a, b) => b.totalSolved - a.totalSolved);
    const topStats = stats.slice(0, 15);
    const leaderboard = topStats.map((u, i) => ({
      rank: i + 1,
      name: u.dbName, 
      points: u.totalSolved,
    }));

    res.status(200).json(leaderboard);
  } catch (error) {
    console.error("Leaderboard error:", error);
    return res.status(500).json({
      error: "Failed to fetch leaderboard",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
