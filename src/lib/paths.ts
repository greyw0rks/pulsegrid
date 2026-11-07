export function appPath(path: string) {
  return `${process.env.NEXT_PUBLIC_PULSEGRID_BASE_PATH || ""}${path}`;
}
