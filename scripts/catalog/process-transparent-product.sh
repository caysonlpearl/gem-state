#!/bin/zsh
set -euo pipefail

if (( $# < 2 || $# > 3 )); then
  print -u2 "Usage: $0 SOURCE_IMAGE OUTPUT_PNG [SELECTION]"
  exit 64
fi

source_image="$1"
output_png="$2"
selection="${3:-center}"
script_dir="${0:A:h}"
cutout_path="$(mktemp -t parkvault-cutout).png"
trap 'rm -f "$cutout_path"' EXIT

swift "$script_dir/remove-background.swift" "$source_image" "$cutout_path" "$selection"
swift "$script_dir/prepare-transparent-product.swift" "$cutout_path" "$output_png"

if [[ ! -s "$output_png" ]]; then
  print -u2 "Image processing did not produce an output file."
  exit 1
fi

print "Processed: $output_png"
sips -g pixelWidth -g pixelHeight -g hasAlpha "$output_png"
