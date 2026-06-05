import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                // Validate environment variables at runtime (when someone tries to log in)
                if (!process.env.ADMIN_USERNAME) {
                    throw new Error("ADMIN_USERNAME environment variable is required");
                }
                if (!process.env.ADMIN_PASSWORD) {
                    throw new Error("ADMIN_PASSWORD environment variable is required");
                }

                const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
                const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

                if (
                    credentials?.username === ADMIN_USERNAME &&
                    credentials?.password === ADMIN_PASSWORD
                ) {
                    return { id: "1", name: ADMIN_USERNAME };
                }
                return null;
            },
        }),
    ],
    pages: {
        signIn: "/login",
    },
    session: { strategy: "jwt" as const },
    secret: process.env.AUTH_SECRET,
};
