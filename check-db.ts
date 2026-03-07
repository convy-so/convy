
import { db } from "./db";
import { surveys } from "./db/schema";
import { desc } from "drizzle-orm";

async function checkSurveys() {
  try {
    console.log("Checking surveys table...");
    const allSurveys = await db.select().from(surveys).orderBy(desc(surveys.createdAt)).limit(5);
    console.log(`Found ${allSurveys.length} surveys.`);
    allSurveys.forEach(s => {
      console.log(`ID: ${s.id}, Title: ${s.title}, Status: ${s.status}, UserID: ${s.userId}`);
    });
    process.exit(0);
  } catch (error) {
    console.error("Error checking surveys:", error);
    process.exit(1);
  }
}

checkSurveys();
