const tags = [
  { id: 1, name: "Vue 3" },
  { id: 2, name: "Nuxt 4" },
  { id: 3, name: "TypeScript" },
  { id: 4, name: "Tailwind" },
  { id: 5, name: "Tiptap" },
  { id: 6, name: "Leaflet" },
  { id: 7, name: "Pinia" },
  { id: 8, name: "DRF" },
  { id: 9, name: "Django" },
  { id: 10, name: "Python" },
];

export default defineEventHandler((event) => {
  const { search } = getQuery(event);
  if (search) {
    const q = String(search).toLowerCase();
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }
  return tags;
});
