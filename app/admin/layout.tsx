import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { User } from "@/lib/models/User";
import connectToMongoDB from "@/lib/mongodb";

/**
 * Server-side admin layout guard.
 *
 * The client AdminCheck component remains for loading/UX only.
 * Authorization is enforced here on the server: unauthenticated
 * users are redirected to sign-in, authenticated non-admins are
 * redirected to home.
 *
 * F-015 fix: admin page is no longer static/client-only.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/auth/signin?callbackUrl=/admin");
  }

  await connectToMongoDB();
  const dbUser = await User.findOne(
    { email: session.user.email },
    { role: 1 }
  ).lean<{ role: "user" | "admin" | "owner" }>();

  if (!dbUser || (dbUser.role !== "admin" && dbUser.role !== "owner")) {
    redirect("/");
  }

  return <>{children}</>;
}
