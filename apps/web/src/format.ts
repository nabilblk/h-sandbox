export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const normalized = value.replace(/(\.\d{3})\d+/, "$1").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
};
