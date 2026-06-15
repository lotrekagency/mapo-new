const categories = [
  { id: 1, name: "Tecnologia" },
  { id: 2, name: "Design" },
  { id: 3, name: "Business" },
  { id: 4, name: "Marketing" },
  { id: 5, name: "Sviluppo" },
  { id: 6, name: "UX / UI" },
  { id: 7, name: "Intelligenza Artificiale" },
  { id: 8, name: "Open Source" },
];

export default defineEventHandler((event) => {
  const { search } = getQuery(event);
  if (search) {
    const q = String(search).toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }
  return categories;
});
