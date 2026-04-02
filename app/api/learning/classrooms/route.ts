import { NextResponse } from "next/server";

import {
  createClassroomAction,
  getTeacherClassroomsAction,
} from "@/app/actions/classroom";

export async function GET() {
  const result = await getTeacherClassroomsAction();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = await createClassroomAction(body);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
