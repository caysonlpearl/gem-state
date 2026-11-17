import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import "yet-another-react-lightbox/plugins/counter.css";

export function PhotoLightbox({
  images,
  index,
  onClose,
  onChange,
}: {
  images: { url: string; alt: string }[];
  index: number;
  onClose: () => void;
  onChange: (index: number) => void;
}) {
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={images.map((image) => ({ src: image.url, alt: image.alt }))}
      plugins={[Zoom, Thumbnails, Counter]}
      on={{ view: ({ index }) => onChange(index) }}
      controller={{ closeOnPullDown: true, closeOnBackdropClick: true }}
      carousel={{ preload: 1, finite: true }}
      thumbnails={{ width: 64, height: 48, borderRadius: 8, gap: 8, padding: 10, vignette: false }}
      animation={{
        fade: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
        swipe: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
      }}
      className="bluebird-photo-lightbox"
    />
  );
}
