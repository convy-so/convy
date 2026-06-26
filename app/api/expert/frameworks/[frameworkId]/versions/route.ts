import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "GONE",
        message: "Framework version endpoints were removed. Use the framework row editor instead.",
      },
    },
    { status: 410 },
  );
}

export function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "GONE",
        message: "Framework version endpoints were removed. Save the framework draft instead.",
      },
    },
    { status: 410 },
  );
}
