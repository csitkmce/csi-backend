import app from "./app.js";
import { initDB } from "./database/init.js";

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await initDB();
    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  }
})();

export default app;
