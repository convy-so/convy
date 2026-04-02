import { NextResponse } from "next/server";

import { requestClassroomAccessAction } from "@/app/actions/classroom";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ classroomId: string }> },
) {
  const body = await request.json();
  const { classroomId } = await params;
  const result = await requestClassroomAccessAction({
    classroomId,
    message: body.message,
  });

  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
