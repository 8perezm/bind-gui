import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";

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
