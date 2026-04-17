#!/bin/bash
# Installs Coqui TTS with warm female voice model
pip install TTS
# Download voice model (warm female — VCTK VITS speaker p225)
python -c "from TTS.api import TTS; TTS('tts_models/en/vctk/vits')"
echo "Coqui TTS installed. Test: python -m TTS --text 'Hello!' --model_name tts_models/en/vctk/vits --speaker_idx p225 --out_path /tmp/test.wav"
