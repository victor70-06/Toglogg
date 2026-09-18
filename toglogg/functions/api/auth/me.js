import { getUserFromRequest, json } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getUserFromRequest(request, env.DB);
  if (!user) {
    return json({ user: null }, { status: 401 });
  }
  return json({ user });
}
