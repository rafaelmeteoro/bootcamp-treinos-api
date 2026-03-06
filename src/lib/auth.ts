import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import { openAPI } from "better-auth/plugins";

import { prisma } from "./db.js";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL as string,
  trustedOrigins: ["http://localhost:3000"],
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [openAPI()],
});
