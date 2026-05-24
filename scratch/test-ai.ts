import { analyzeLearningMaterial } from "../lib/learning/materials";

async function main() {
  console.log("Testing AI review of learning material...");
  try {
    const res = await analyzeLearningMaterial({
      topicTitle: "Quadratic Equations",
      topicDescription: "Solve quadratic equations",
      learningOutcomes: [
        {
          title: "Solve quadratic equations by factoring",
          description: "Find roots of quadratic equations by factoring trinomials."
        }
      ],
      materialText: "A quadratic equation is of the form ax^2 + bx + c = 0. To solve it by factoring, find two numbers that multiply to ac and add to b. For example, x^2 + 5x + 6 = 0 factors as (x+2)(x+3) = 0."
    });
    console.log("AI Analysis Result:", res);
  } catch (err) {
    console.error("AI Analysis Failed:");
    console.error(err);
  }
}

main().catch(console.error);
