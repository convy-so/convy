import { NextResponse } from "next/server";

import {
  getClassroomAccessRequestsAction,
  respondToClassroomAccessRequestAction,
} from "@/app/actions/classroom";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const { classroomId } = await params;
  const result = await getClassroomAccessRequestsAction(classroomId);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const body = await request.json();
  const { classroomId } = await params;
  const result = await respondToClassroomAccessRequestAction({
    classroomId,
    requestId: body.requestId,
    decision: body.decision,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
