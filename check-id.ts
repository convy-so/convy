
import { db } from "./db";
import { surveys } from "./db/schema";
import { eq } from "drizzle-orm";

async function checkSpecificSurvey(id: string) {
    try {
        console.log(`Checking survey with ID: ${id}...`);
        const [survey] = await db.select().from(surveys).where(eq(surveys.id, id));
        if (survey) {
            console.log(`FOUND! Title: ${survey.title}, Status: ${survey.status}, UserID: ${survey.userId}`);
        } else {
            console.log("NOT FOUND in database.");
        }
        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkSpecificSurvey("P8FqEMdksdRK1Z1UhhzcV");
