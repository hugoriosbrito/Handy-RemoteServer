use crate::audio_toolkit::audio::FrameResampler;
use anyhow::Result;
use hound::{WavReader, WavSpec, WavWriter};
use log::debug;
use rodio::{Decoder, Source};
use std::io::Cursor;
use std::path::Path;
use std::time::Duration;

/// Sample rate expected by the transcription pipeline.
const TARGET_SAMPLE_RATE: usize = 16_000;

/// Read a WAV file and return normalised f32 samples.
pub fn read_wav_samples<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let reader = WavReader::open(file_path.as_ref())?;
    let samples = reader
        .into_samples::<i16>()
        .map(|s| s.map(|v| v as f32 / i16::MAX as f32))
        .collect::<Result<Vec<f32>, _>>()?;
    Ok(samples)
}

/// Decode arbitrary compressed or PCM audio bytes (WAV, m4a/AAC, mp3, FLAC, …)
/// into mono f32 samples at the pipeline's [`TARGET_SAMPLE_RATE`].
///
/// Mobile clients record with the platform codec (Android/iOS produce AAC in an
/// m4a container — neither can emit raw WAV), so the remote server must decode
/// and resample rather than assume 16 kHz WAV. Format is auto-detected from the
/// byte stream, so no filename/extension hint is needed.
pub fn decode_audio_to_samples(bytes: Vec<u8>) -> Result<Vec<f32>> {
    let decoder = Decoder::new(Cursor::new(bytes)).map_err(|e| {
        anyhow::anyhow!("could not decode audio (unsupported or corrupt format): {e}")
    })?;

    let in_rate = decoder.sample_rate() as usize;
    let channels = decoder.channels().max(1) as usize;

    // Decoder yields interleaved f32 samples across all channels.
    let interleaved: Vec<f32> = decoder.collect();

    // Downmix to mono by averaging each frame's channels.
    let mono: Vec<f32> = if channels > 1 {
        interleaved
            .chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        interleaved
    };

    if in_rate == TARGET_SAMPLE_RATE || mono.is_empty() {
        return Ok(mono);
    }

    // Resample to 16 kHz. FrameResampler emits fixed-length frames and
    // zero-pads the tail, which is harmless for transcription.
    let mut resampler = FrameResampler::new(in_rate, TARGET_SAMPLE_RATE, Duration::from_millis(30));
    let mut out = Vec::with_capacity(mono.len() * TARGET_SAMPLE_RATE / in_rate + 1);
    resampler.push(&mono, |frame| out.extend_from_slice(frame));
    resampler.finish(|frame| out.extend_from_slice(frame));
    Ok(out)
}

/// Verify a WAV file by reading it back and checking the sample count.
pub fn verify_wav_file<P: AsRef<Path>>(file_path: P, expected_samples: usize) -> Result<()> {
    let reader = WavReader::open(file_path.as_ref())?;
    let actual_samples = reader.len() as usize;
    if actual_samples != expected_samples {
        anyhow::bail!(
            "WAV sample count mismatch: expected {}, got {}",
            expected_samples,
            actual_samples
        );
    }
    Ok(())
}

/// Save audio samples as a WAV file
pub fn save_wav_file<P: AsRef<Path>>(file_path: P, samples: &[f32]) -> Result<()> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(file_path.as_ref(), spec)?;

    // Convert f32 samples to i16 for WAV
    for sample in samples {
        let sample_i16 = (sample * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16)?;
    }

    writer.finalize()?;
    debug!("Saved WAV file: {:?}", file_path.as_ref());
    Ok(())
}
