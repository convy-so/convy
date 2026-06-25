import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/features/auth/public-server";

export const { GET, POST } = toNextJsHandler(auth.handler);
