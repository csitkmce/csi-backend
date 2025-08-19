import app from "./app.js";
import { initDB } from "./database/init.js";

const PORT = process.env.PORT;

(async () => {
  try {
    await initDB(); 
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1); 
  }
})();
