import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Custom player with a speed selector, a large seek bar and a compact
 * time readout. Range requests are served by Vite (dev) and the static host.
 */
export default function AudioPlayer({ src, label }: { src: string; label?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const scrubbing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(() => {
    try {
      const stored = Number(localStorage.getItem("onestopdutch-audio-rate"));
      return SPEEDS.includes(stored) ? stored : 1;
    } catch {
      return 1;
    }
  });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.playbackRate = rate;
    try {
      localStorage.setItem("onestopdutch-audio-rate", String(rate));
    } catch {
      // Ignore unavailable storage.
    }
  }, [rate]);

  useEffect(() => {
    scrubbing.current = false;
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setError(false);
  }, [src]);

  function toggle() {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => setError(true));
    } else {
      audio.pause();
    }
  }

  function commitSeek(value: number) {
    const audio = ref.current;
    if (!audio) return;
    audio.currentTime = value;
    setTime(value);
  }

  if (error) {
    return (
      <span className="audio-player audio-player--error" role="status">
        Audio unavailable for this track.
      </span>
    );
  }

  return (
    <span className="audio-player">
      <audio
        ref={ref}
        preload="metadata"
        src={src}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={(event) => {
          if (!scrubbing.current) setTime(event.currentTarget.currentTime);
        }}
        onSeeked={(event) => {
          if (!scrubbing.current) setTime(event.currentTarget.currentTime);
        }}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
      />
      <button
        type="button"
        className={playing ? "audio-player__toggle is-playing" : "audio-player__toggle"}
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
      >
        <Icon name={playing ? "pause" : "play"} size={16} />
      </button>
      <select
        className="audio-player__speed"
        value={rate}
        onChange={(event) => {
          setRate(Number(event.target.value));
          event.currentTarget.blur();
        }}
        aria-label="Playback speed"
        title="Playback speed"
      >
        {SPEEDS.map((speed) => (
          <option key={speed} value={speed}>
            {speed}×
          </option>
        ))}
      </select>
      <input
        className="audio-player__seek"
        type="range"
        style={
          {
            "--seek-progress": `${duration ? (Math.min(time, duration) / duration) * 100 : 0}%`,
          } as CSSProperties
        }
        min={0}
        max={duration || 0}
        step={0.1}
        value={duration ? Math.min(time, duration) : 0}
        onChange={(event) => {
          const value = Number(event.target.value);
          setTime(value);
          if (!scrubbing.current) commitSeek(value);
        }}
        onPointerDown={() => {
          scrubbing.current = true;
        }}
        onPointerUp={(event) => {
          if (!scrubbing.current) return;
          scrubbing.current = false;
          commitSeek(Number(event.currentTarget.value));
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
        }}
        onBlur={() => {
          scrubbing.current = false;
        }}
        aria-label="Seek"
      />
      <span className="audio-player__time">
        {formatTime(time)} / {formatTime(duration)}
      </span>
    </span>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
