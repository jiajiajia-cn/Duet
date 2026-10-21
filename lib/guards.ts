import { redirect } from "next/navigation";
import { getUserId } from "./session";

/** Server Action 里拿当前用户，没登录就跳登录页 */
export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}