
import "dotenv/config";
import { SkillEngine } from "../lib/agents/skill-system/engine";

async function testMatch() {
  const queries = [
    "I want to understand why my customers are leaving and how they feel about our brand long-term",
    "We need to test the taste and texture of our new beverage",
    "How do employees feel about the new office layout and hybrid work policy?",
    "Researching the ethical implications of our new AI clinical trial protocol",
    "Understanding the B2B buying process for enterprise software",
  ];

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    try {
      const matches = await SkillEngine.semanticMatch(query);
      console.log("Matches found:");
      matches.forEach((m, i) => {
        console.log(`${i + 1}. ${m.subDomain.name} (ID: ${m.subDomain.id}) | Weight: ${m.weight.toFixed(2)}`);
      });
    } catch (error) {
      console.error("Match failed:", error);
    }
  }
}

testMatch().then(() => process.exit(0));
