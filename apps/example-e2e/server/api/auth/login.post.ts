import { defineEventHandler } from "h3";
import { login } from "../../utils/session";

export default defineEventHandler((event) => login(event));
