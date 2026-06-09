"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";

// Same-origin: omit baseURL so requests go to the current host (not baked localhost).
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
    }),
    adminClient(),
  ],
});

export type AuthClient = typeof authClient;

