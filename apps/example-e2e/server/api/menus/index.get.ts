import { listMenus } from "../../utils/menuDb";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  return listMenus(query.search ? String(query.search) : undefined);
});
