import { type Request, type Response } from "express";
import { pool } from "../../config/db.js";
import fetch from "node-fetch";

let cachedLeaderboard: any[] = [];
let lastUpdatedTime: number = 0;

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


function getTimeAgo(ms: number) {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

async function refreshLeaderboardCache() {
  try {
    const result = await pool.query("SELECT name, username FROM leetcode_users");
    const users = result.rows;
    const usernames = users.map((u) => u.username);

    const stats = await getBatchStats(usernames);

    const merged = users.map((u) => {
      const stat = stats.find((s) => s.username === u.username);
      return {
        dbName: u.name,
        username: u.username,
        totalSolved: stat?.totalSolved || 0,
      };
    });

    merged.sort((a, b) => b.totalSolved - a.totalSolved);

    cachedLeaderboard = merged.map((u, i) => ({
      rank: i + 1,
      name: u.dbName,
      points: u.totalSolved,
    }));

    lastUpdatedTime = Date.now();
    console.log("Leaderboard cache refreshed");
  } catch (err) {
    console.error("Failed to refresh leaderboard cache:", err);
  }
}

// Initialize background refresh every 30 minutes
refreshLeaderboardCache(); 
setInterval(refreshLeaderboardCache, 30 * 60 * 1000);

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    if (cachedLeaderboard.length === 0) {
      await refreshLeaderboardCache();
    }

    res.status(200).json(cachedLeaderboard.slice(0, 15));

    //const top15 = cachedLeaderboard.slice(0, 15);

    // res.status(200).json({
    //   lastUpdated: getTimeAgo(lastUpdatedTime),
    //   leaderboard: top15,
    // });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return res.status(500).json({
      error: "Failed to fetch leaderboard",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
