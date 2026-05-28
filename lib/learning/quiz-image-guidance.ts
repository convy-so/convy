export type QuizImageGuidanceItem = {
  title: string;
  description: string;
};

export function getQuizImageGuidance(): QuizImageGuidanceItem[] {
  return [
    {
      title: "Use good light",
      description: "Make sure the page is bright and easy to read. Avoid strong shadows and glare.",
    },
    {
      title: "Show the whole page",
      description: "Keep the full question and your working in frame so nothing important is cut off.",
    },
    {
      title: "Keep it steady",
      description: "Hold the camera straight and focus on the page. A flat page is easier for the model to read.",
    },
    {
      title: "Send more than one photo if needed",
      description: "If your solution takes more than one page, upload the next images in order.",
    },
  ];
}
