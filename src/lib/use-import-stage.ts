import { useServerFn } from "@tanstack/react-start";
import {
  stageFacebookImportBatch,
  prepareFacebookImportPhotoPreviewSource,
  type StageImportInput,
} from "./fb-import.functions";
import { stageImportWithPhotoPreviews } from "./import-photo-preview.browser";

export function useImportStage() {
  const stage = useServerFn(stageFacebookImportBatch);
  const source = useServerFn(prepareFacebookImportPhotoPreviewSource);
  return (options: { data: StageImportInput }) =>
    stageImportWithPhotoPreviews(options, {
      stage: (input) => stage(input),
      source: (input) => source({ data: input }),
    });
}
