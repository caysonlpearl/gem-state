import { createServerOnlyFn } from "@tanstack/react-start";

// Mixed *.functions modules also enter the browser dependency graph. The
// compiler removes this import from that graph before resolving server code.
export const getPhotoStorageModule = createServerOnlyFn(() => import("./photo-storage.server"));
