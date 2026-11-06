import { defineEventHandler } from "h3";
import { requireUser } from "../../utils/session";

// The signed-in user: Mapo's `userInfoApi`, which the AI gateway also asks
// who calls it, forwarding the request's cookie.
export default defineEventHandler((event) => requireUser(event));
