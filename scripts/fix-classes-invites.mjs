import fs from "fs";

const p = "app/[locale]/student/classes/student-classes-client.tsx";
let s = fs.readFileSync(p, "utf8");

// STOP - use only this:
const inviteBlock = [
  '        <div className="space-y-4">',
  '          <div className="flex flex-wrap items-center gap-2 px-1">',
  '            <Sparkles className="h-4 w-4 text-amber-500" />',
  '            <h2 className="text-sm font-semibold text-gray-900">Invites for you</h2>',
  '            <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">',
  "              {invitations.length} new",
  "            </span>",
  "          </div>",
  '          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">',
  "            {invitations.map((invitation) => (",
  "              <StudentInvitationCard",
  "                key={invitation.id}",
  "                invitation={invitation}",
  "                onAccept={() => acceptInvitationMutation.mutate(invitation.id)}",
  "                onDecline={() => rejectInvitationMutation.mutate(invitation.id)}",
  "                acceptPending={",
  "                  acceptInvitationMutation.isPending && acceptInvitationMutation.variables === invitation.id",
  "                }",
  "                declinePending={",
  "                  rejectInvitationMutation.isPending && rejectInvitationMutation.variables === invitation.id",
  "                }",
  "              />",
  "            ))}",
  "          </motionlessCardInvitesBlock>",
  "        </motionlessCardInvitesBlock>",
].join("\n")
  .replace(/<\/?motionlessCardInvitesBlock>/g, (m) => (m.startsWith("</") ? "</motionlessCardInvitesBlock>".replace("motionlessCardInvitesBlock", "div") : "<motionlessCardInvitesBlock>".replace("motionlessCardInvitesBlock", "motionlessCardInvitesBlock")));

// This is getting too messy. Use simple replace:
const good = inviteBlock
  .replace(/motionlessCardInvitesBlock/g, "div")
  .replace("<div>", "<div>"); // noop

fs.writeFileSync(p, s.replace(/<motionlessCard[^/]*\/>/, good.split("\n")[0] === good ? good : inviteBlock.replace(/motionlessCardInvitesBlock/g, "motionlessCardInvitesBlock")));
console.log("fail");
