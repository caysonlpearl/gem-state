import type { DetailedHTMLProps, HTMLAttributes } from "react";

type ModelViewerProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  alt?: string;
  ar?: boolean;
  autoplay?: boolean;
  "auto-rotate"?: boolean;
  "camera-controls"?: boolean;
  "camera-orbit"?: string;
  "disable-pan"?: boolean;
  "environment-image"?: string;
  "interaction-prompt"?: "auto" | "none";
  loading?: "auto" | "eager" | "lazy";
  poster?: string | undefined;
  reveal?: "auto" | "interaction" | "manual";
  "shadow-intensity"?: string;
  src?: string;
  "touch-action"?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerProps;
    }
  }
}

export {};
