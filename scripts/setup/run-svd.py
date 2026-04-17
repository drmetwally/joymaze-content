#!/usr/bin/env python3

import argparse
import sys


def parse_args():
    parser = argparse.ArgumentParser(
        description="Animate a still image into an MP4 using Stable Video Diffusion."
    )
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output MP4 path")
    parser.add_argument("--frames", type=int, default=25, help="Number of frames to export")
    parser.add_argument("--fps", type=int, default=8, help="Output frames per second")
    return parser.parse_args()


def main():
    args = parse_args()

    try:
        import torch
    except ImportError:
        print("Warning: torch is not installed.", file=sys.stderr)
        sys.exit(1)

    if not torch.cuda.is_available():
        print("Warning: CUDA is unavailable; Stable Video Diffusion requires CUDA.", file=sys.stderr)
        sys.exit(1)

    try:
        from diffusers import StableVideoDiffusionPipeline
        from diffusers.utils import export_to_video
        from PIL import Image
    except ImportError as error:
        print(f"Warning: missing dependency: {error}", file=sys.stderr)
        sys.exit(1)

    try:
        input_image = Image.open(args.input).convert("RGB")

        pipe = StableVideoDiffusionPipeline.from_pretrained(
            "stabilityai/stable-video-diffusion-img2vid-xt",
            torch_dtype=torch.float16,
            variant="fp16",
        )
        pipe = pipe.to("cuda")

        result = pipe(
            input_image,
            num_frames=args.frames,
            decode_chunk_size=min(args.frames, 8),
        )

        frames = result.frames[0]
        export_to_video(frames, args.output, fps=args.fps)
    except Exception as error:
        print(f"Warning: SVD generation failed: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
