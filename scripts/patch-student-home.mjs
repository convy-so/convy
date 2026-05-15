import fs from "fs";

const path = "components/learning/student-learning-home.tsx";
let s = fs.readFileSync(path, "utf8");

const glassStart = s.indexOf("<GlassPanel \n                  key={membership.classroomStudentId}");
if (glassStart === -1) {
  console.error("GlassPanel block not found");
  process.exit(1);
}
const glassEnd = s.indexOf("</GlassPanel>", glassStart) + "</GlassPanel>".length;

const replacement = `<StudentCourseCard
                  key={membership.classroomStudentId}
                  membership={membership}
                  isActive={isActive}
                  variant="selectable"
                  onSelect={() => {
                    setSelectedMembershipId(membership.classroomStudentId);
                    setSelectedTopicId(membership.topics[0]?.id ?? null);
                    setOutOfSessionReply(null);
                  }}
                />`;

s = s.slice(0, glassStart) + replacement + s.slice(glassEnd);

const replacements = [
  [
    'className="space-y-8"\n            >\n              {/* Header for Active Area */}\n              <div className="relative z-20 flex',
    'className="space-y-8 overflow-visible"\n            >\n              {/* Header for Active Area */}\n              <div className="relative z-40 flex',
  ],
  ["relative z-30 flex w-full flex-1", "relative z-50 flex w-full flex-1"],
  ["absolute right-0 top-full z-[200] mt-2", "absolute right-0 top-full z-[100] mt-2"],
  [
    '<div className="relative z-0 grid grid-cols-1 gap-8 lg:grid-cols-3">',
    '<div className="grid grid-cols-1 gap-8 lg:grid-cols-3">',
  ],
];

for (const [from, to] of replacements) {
  if (from) s = s.replace(from, to);
}

fs.writeFileSync(path, s);
console.log("done");
