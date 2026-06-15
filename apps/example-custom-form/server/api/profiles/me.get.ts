import { defineEventHandler } from "h3";
import { requireUser } from "../../utils/session";

export default defineEventHandler((event) => requireUser(event));
