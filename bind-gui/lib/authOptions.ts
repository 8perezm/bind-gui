import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

// Validate required environment variables at startup
if (!process.env.ADMIN_USERNAME) {
    throw new Error("ADMIN_USERNAME environment variable is required");
}
if (!process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD environment variable is required");
}
if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET environment variable is required. Generate one with: openssl rand -base64 32");
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
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
