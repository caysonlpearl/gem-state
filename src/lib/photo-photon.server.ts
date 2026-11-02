import { initPhoton, PhotonImage, resize, SamplingFilter } from "@cf-wasm/photon/others";
import photonModule from "@cf-wasm/photon/photon.wasm?module";

// Photon supplies its own wasm-bindgen imports. Nitro must provide the raw
// compiled module (?module), rather than instantiate it with an empty map.
export function photoProcessor() {
  if (!initPhoton.initialized) initPhoton.sync({ module: photonModule });
  return { PhotonImage, resize, SamplingFilter };
}
