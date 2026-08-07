import { openDatabase } from "./database.ts";

const db = openDatabase();
console.log(`auto-ad database ready: ${process.env.DATABASE_PATH ?? "./data/app.db"}`);
db.close();

