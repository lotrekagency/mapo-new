import { mediaLangInfo } from "./_store";

// Endpoint metadata: OPTIONS /api/media/. Like Camomilla, it declares which
// languages the media metadata is translated into, and the media manager reads
// them from here.
export default defineEventHandler(() => ({
  name: "Media",
  lang_info: mediaLangInfo,
}));
