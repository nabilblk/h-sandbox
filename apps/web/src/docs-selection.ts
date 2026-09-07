export const docsPageKey = "harakiri_docs_page";

export const setDocsPageSelection = (pageId: string) => {
  try { sessionStorage.setItem(docsPageKey, pageId); } catch { /* Deep links also work without storage. */ }
};

export const rememberedDocsPage = () => {
  try { return sessionStorage.getItem(docsPageKey); } catch { return null; }
};
